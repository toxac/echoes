import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Circle, Polyline, MapPressEvent } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/utils/supabase';
import { getCurrentCoordinates } from '../../src/engine/LocationTask';
import { pickLocalAudioFile, uploadAudioToStorage } from '../../src/lib/mediaUpload';
import {
  JourneyWithDetails,
  JourneyMode,
  VisibilityTier,
  TriggerConfig,
} from '../../src/types/journey';

export default function JourneyStudioScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const router = useRouter();

  const [journey, setJourney] = useState<JourneyWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState<JourneyMode>('route');
  const [visibility, setVisibility] = useState<VisibilityTier>('public');

  const [draftPin, setDraftPin] = useState<{ latitude: number; longitude: number } | null>(null);

  const loadJourney = useCallback(async () => {
    if (!journeyId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('journeys')
      .select(`
        *,
        stops:journey_stops (
          *,
          waypoint:waypoints (*)
        ),
        legs:journey_legs (*)
      `)
      .eq('id', journeyId)
      .single();

    if (!error && data) {
      const sortedStops = [...(data.stops ?? [])].sort(
        (a, b) => a.sequence_order - b.sequence_order
      );
      const formatted = { ...data, stops: sortedStops } as unknown as JourneyWithDetails;
      setJourney(formatted);
      setTitle(formatted.title);
      setSummary(formatted.summary ?? '');
      setMode((formatted.mode as JourneyMode) || 'route');
      setVisibility((formatted.visibility as VisibilityTier) || 'public');
    }
    setLoading(false);
  }, [journeyId]);

  useFocusEffect(
    useCallback(() => {
      loadJourney();
    }, [loadJourney])
  );

  async function handleSaveMetadata() {
    if (!journeyId || !title.trim()) return;
    setSavingMeta(true);
    const { error } = await supabase
      .from('journeys')
      .update({
        title: title.trim(),
        summary: summary.trim() || null,
        mode,
        visibility,
      })
      .eq('id', journeyId);

    setSavingMeta(false);
    if (error) {
      Alert.alert('Save Failed', error.message);
    } else {
      Alert.alert('Saved', 'Journey details updated.');
    }
  }

  function handleMapPress(e: MapPressEvent) {
    setDraftPin(e.nativeEvent.coordinate);
  }

  async function handlePinMyLocation() {
    const coords = await getCurrentCoordinates();
    if (!coords) {
      Alert.alert('Location Unavailable', 'Grant location permission to drop a pin where you stand.');
      return;
    }
    setDraftPin(coords);
  }

  function handleOpenStopEditor() {
    if (!journey) return;
    const target = draftPin ?? { latitude: 12.9765, longitude: 77.5925 };
    const nextOrder = journey.stops.length + 1;

    router.push({
      pathname: '/studio/stop-editor',
      params: {
        journeyId: journey.id,
        latitude: String(target.latitude),
        longitude: String(target.longitude),
        nextOrder: String(nextOrder),
        siteId: journey.site_id ?? '',
      },
    });
    setDraftPin(null);
  }

  async function handleAttachTransitAudio(fromStopId: string, toStopId: string) {
    if (!journey) return;
    try {
      const picked = await pickLocalAudioFile();
      if (!picked) return;

      const storagePath = await uploadAudioToStorage(
        picked.uri,
        `journeys/${journey.id}/legs`,
        picked.mimeType
      );

      const existingLeg = journey.legs.find(
        (l) => l.from_stop_id === fromStopId && l.to_stop_id === toStopId
      );

      if (existingLeg) {
        await supabase
          .from('journey_legs')
          .update({ transit_audio_path: storagePath })
          .eq('id', existingLeg.id);
      } else {
        await supabase.from('journey_legs').insert({
          journey_id: journey.id,
          from_stop_id: fromStopId,
          to_stop_id: toStopId,
          transit_audio_path: storagePath,
        });
      }

      Alert.alert('Transit Audio Added', `Attached "${picked.name}" between stops.`);
      loadJourney();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message);
    }
  }

  async function handleDeleteStop(stopId: string) {
    Alert.alert('Remove Stop', 'Delete this stop from the journey?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('journey_stops').delete().eq('id', stopId);
          loadJourney();
        },
      },
    ]);
  }

  if (loading || !journey) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  const firstWaypoint = journey.stops[0]?.waypoint;
  const initialRegion = {
    latitude: draftPin?.latitude ?? firstWaypoint?.latitude ?? 12.9765,
    longitude: draftPin?.longitude ?? firstWaypoint?.longitude ?? 77.5925,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };

  const routeCoords = journey.stops
    .filter((s) => s.waypoint)
    .map((s) => ({
      latitude: s.waypoint!.latitude,
      longitude: s.waypoint!.longitude,
    }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Map Pin Dropper */}
      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          onPress={handleMapPress}
        >
          {routeCoords.length > 1 && (
            <Polyline coordinates={routeCoords} strokeColor="#0F172A" strokeWidth={3} />
          )}

          {journey.stops.map((stop) => {
            if (!stop.waypoint) return null;
            const cfg = stop.waypoint.trigger_config as TriggerConfig;
            return (
              <React.Fragment key={stop.id}>
                <Marker
                  coordinate={{
                    latitude: stop.waypoint.latitude,
                    longitude: stop.waypoint.longitude,
                  }}
                  title={`${stop.sequence_order}. ${stop.title}`}
                />
                <Circle
                  center={{
                    latitude: stop.waypoint.latitude,
                    longitude: stop.waypoint.longitude,
                  }}
                  radius={cfg?.radius_meters ?? 25}
                  fillColor="rgba(16, 185, 129, 0.2)"
                  strokeColor="rgba(16, 185, 129, 0.8)"
                  strokeWidth={2}
                />
              </React.Fragment>
            );
          })}

          {draftPin && (
            <Marker coordinate={draftPin} pinColor="#F59E0B" title="New Stop Pin" />
          )}
        </MapView>

        <View style={styles.mapActions}>
          <TouchableOpacity style={styles.gpsBtn} onPress={handlePinMyLocation}>
            <Ionicons name="locate" size={16} color="#0F172A" />
            <Text style={styles.gpsBtnText}>Pin Current GPS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addStopBtn} onPress={handleOpenStopEditor}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addStopBtnText}>
              {draftPin ? 'Add Stop at Pin' : 'Add Stop'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stop Sequence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stops Sequence ({journey.stops.length})</Text>
        <Text style={styles.hint}>
          Tap anywhere on the map above or use Current GPS, then tap "Add Stop".
        </Text>

        {journey.stops.map((stop, idx) => {
          const nextStop = journey.stops[idx + 1];
          const existingLeg = nextStop
            ? journey.legs.find(
                (l) => l.from_stop_id === stop.id && l.to_stop_id === nextStop.id
              )
            : null;

          return (
            <View key={stop.id}>
              <View style={styles.stopCard}>
                <View style={styles.orderCircle}>
                  <Text style={styles.orderText}>{stop.sequence_order}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopTitle}>{stop.title}</Text>
                  <Text style={styles.stopMeta}>
                    {stop.waypoint
                      ? `${stop.waypoint.latitude.toFixed(5)}, ${stop.waypoint.longitude.toFixed(5)}`
                      : 'No coordinates'}
                  </Text>
                  {stop.landmark_cue ? (
                    <Text style={styles.stopCue} numberOfLines={1}>
                      Cue: {stop.landmark_cue}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => handleDeleteStop(stop.id)}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>

              {nextStop && (
                <TouchableOpacity
                  style={styles.legBtn}
                  onPress={() => handleAttachTransitAudio(stop.id, nextStop.id)}
                >
                  <Ionicons name="musical-notes-outline" size={15} color="#475569" />
                  <Text style={styles.legBtnText}>
                    {existingLeg?.transit_audio_path
                      ? 'Transit Music Attached (Tap to Replace)'
                      : '+ Add In-Transit Music Bed to Next Stop'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {journey.stops.length > 0 && (
          <TouchableOpacity
            style={styles.previewWalkBtn}
            onPress={() => router.push(`/journey/${journey.id}`)}
          >
            <Ionicons name="walk-outline" size={18} color="#FFFFFF" />
            <Text style={styles.previewWalkBtnText}>Test & Walk This Journey</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Metadata Editor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Journey Settings</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Journey Title"
        />
        <TextInput
          style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
          value={summary}
          onChangeText={setSummary}
          placeholder="Brief description of what the listener will experience..."
          multiline
        />

        <Text style={styles.label}>Playback Mode</Text>
        <View style={styles.row}>
          {(['route', 'free_roam'] as JourneyMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, mode === m && styles.chipActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>
                {m === 'route' ? 'Guided Route' : 'Free-Roam'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Visibility Tier</Text>
        <View style={styles.row}>
          {(['private', 'shared', 'public'] as VisibilityTier[]).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.chip, visibility === v && styles.chipActive]}
              onPress={() => setVisibility(v)}
            >
              <Text style={[styles.chipText, visibility === v && styles.chipTextActive]}>
                {v.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveMetadata}
          disabled={savingMeta}
        >
          <Text style={styles.saveBtnText}>
            {savingMeta ? 'Saving...' : 'Save Journey Settings'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapWrapper: { height: 290, position: 'relative' },
  map: { flex: 1 },
  mapActions: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    elevation: 3,
  },
  gpsBtnText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    elevation: 3,
  },
  addStopBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 14,
    marginBottom: 0,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  hint: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  stopTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  stopMeta: { fontSize: 12, color: '#64748B' },
  stopCue: { fontSize: 12, color: '#059669', marginTop: 2 },
  legBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#CBD5E1',
    marginLeft: 24,
    paddingLeft: 12,
    gap: 6,
  },
  legBtnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  previewWalkBtn: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 13,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  previewWalkBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 10,
  },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  chipActive: { backgroundColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#FFFFFF' },
  saveBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});