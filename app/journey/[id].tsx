import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Circle, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/utils/supabase';
import { JourneyWithDetails, TriggerConfig } from '../../src/types/journey';
import { playbackEngine } from '../../src/engine/PlaybackEngine';
import { startLocationTracking } from '../../src/engine/LocationTask';

export default function JourneyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [journey, setJourney] = useState<JourneyWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('journeys')
      .select(`
        *,
        stops:journey_stops (
          *,
          waypoint:waypoints (*)
        ),
        legs:journey_legs (*)
      `)
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const sortedStops = [...(data.stops ?? [])].sort(
            (a, b) => a.sequence_order - b.sequence_order
          );
          setJourney({ ...data, stops: sortedStops } as unknown as JourneyWithDetails);
        }
        setLoading(false);
      });
  }, [id]);

  async function launchWalk() {
    if (!journey) return;
    setStarting(true);
    try {
      await playbackEngine.startJourney(journey);
      router.replace('/(tabs)/current');
    } catch (err: any) {
      Alert.alert('Error Starting Journey', err.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleStartJourney() {
    if (!journey) return;
    if (journey.stops.length === 0) {
      Alert.alert('No Stops Yet', 'Add at least one sound stop in Studio before walking.');
      return;
    }

    const gpsGranted = await startLocationTracking();
    if (!gpsGranted) {
      Alert.alert(
        'Background GPS Not Granted',
        'Automatic geofence triggers require "Always" location access, or you can continue in Desk Simulation mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue in Desk Mode', onPress: launchWalk },
        ]
      );
      return;
    }

    await launchWalk();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  if (!journey) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Journey not found.</Text>
      </View>
    );
  }

  const routeCoords = journey.stops
    .filter((s) => s.waypoint)
    .map((s) => ({
      latitude: s.waypoint!.latitude,
      longitude: s.waypoint!.longitude,
    }));

  const initialRegion = routeCoords[0]
    ? {
        ...routeCoords[0],
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : {
        latitude: 12.9765,
        longitude: 77.5925,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.mapWrapper}>
          <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation>
            {routeCoords.length > 1 && (
              <Polyline coordinates={routeCoords} strokeColor="#0F172A" strokeWidth={3} />
            )}
            {journey.stops.map((stop) => {
              if (!stop.waypoint) return null;
              const radius = (stop.waypoint.trigger_config as TriggerConfig)?.radius_meters ?? 25;
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
                    radius={radius}
                    fillColor="rgba(16, 185, 129, 0.22)"
                    strokeColor="#059669"
                    strokeWidth={2}
                  />
                </React.Fragment>
              );
            })}
          </MapView>
        </View>

        <View style={styles.body}>
          <View style={styles.badgeRow}>
            <Text style={styles.lensBadge}>{journey.lens_type.toUpperCase()} LENS</Text>
            <Text style={styles.modeBadge}>
              {journey.mode === 'route' ? 'GUIDED ROUTE' : 'FREE-ROAM'}
            </Text>
          </View>

          <Text style={styles.title}>{journey.title}</Text>
          {journey.summary ? <Text style={styles.summary}>{journey.summary}</Text> : null}

          <Text style={styles.sectionHeader}>Stops ({journey.stops.length})</Text>
          {journey.stops.map((stop) => {
            const radius =
              (stop.waypoint?.trigger_config as TriggerConfig)?.radius_meters ?? 25;
            return (
              <View key={stop.id} style={styles.stopRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepText}>{stop.sequence_order}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopTitle}>{stop.title}</Text>
                  {stop.landmark_cue ? (
                    <Text style={styles.stopCue}>{stop.landmark_cue}</Text>
                  ) : null}
                  <Text style={styles.stopRadius}>Trigger zone: {radius}m radius</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={handleStartJourney}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="walk-outline" size={20} color="#FFFFFF" />
              <Text style={styles.startBtnText}>Start Journey</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#64748B' },
  mapWrapper: { height: 240 },
  map: { flex: 1 },
  body: { padding: 18 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  lensBadge: { fontSize: 11, fontWeight: '700', color: '#059669' },
  modeBadge: { fontSize: 11, fontWeight: '700', color: '#6366F1' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  summary: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 18 },
  sectionHeader: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  stopRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  stopTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  stopCue: { fontSize: 13, color: '#334155', marginTop: 2 },
  stopRadius: { fontSize: 11, color: '#64748B', marginTop: 4 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  startBtn: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 15,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});