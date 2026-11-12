import React, { useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Circle, MapPressEvent } from 'react-native-maps';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/utils/supabase';
import { getCurrentCoordinates } from '../../src/engine/LocationTask';
import { pickLocalAudioFile, uploadAudioToStorage } from '../../src/lib/mediaUpload';

const RADIUS_OPTIONS = [15, 25, 40, 60];

export default function StopEditorModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    journeyId: string;
    latitude: string;
    longitude: string;
    nextOrder: string;
    siteId: string;
  }>();

  const [coords, setCoords] = useState({
    latitude: parseFloat(params.latitude || '12.9765'),
    longitude: parseFloat(params.longitude || '77.5925'),
  });
  const [title, setTitle] = useState('');
  const [landmarkCue, setLandmarkCue] = useState('');
  const [radius, setRadius] = useState(25);

  const [primaryAudio, setPrimaryAudio] = useState<{
    uri: string;
    label: string;
    mimeType: string;
  } | null>(null);

  const [handoffAudio, setHandoffAudio] = useState<{
    uri: string;
    label: string;
    mimeType: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  async function handleStartRecording() {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert('Microphone Permission', 'Allow microphone access to record voice notes.');
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }

  async function handleStopRecording() {
    await audioRecorder.stop();
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });

    if (audioRecorder.uri) {
      const secs = Math.max(1, Math.round(recorderState.durationMillis / 1000));
      setPrimaryAudio({
        uri: audioRecorder.uri,
        label: `Live Recording (${secs}s)`,
        mimeType: 'audio/mp4',
      });
    }
  }

  async function handlePickPrimaryFile() {
    const picked = await pickLocalAudioFile();
    if (picked) {
      setPrimaryAudio({
        uri: picked.uri,
        label: picked.name,
        mimeType: picked.mimeType,
      });
    }
  }

  async function handlePickHandoffFile() {
    const picked = await pickLocalAudioFile();
    if (picked) {
      setHandoffAudio({
        uri: picked.uri,
        label: picked.name,
        mimeType: picked.mimeType,
      });
    }
  }

  async function handleSnapToGps() {
    const current = await getCurrentCoordinates();
    if (current) {
      setCoords(current);
    }
  }

  async function handleSaveStop() {
    if (!params.journeyId) return;
    if (!title.trim()) {
      Alert.alert('Stop Title Required', 'Enter a name for this spot.');
      return;
    }
    if (!primaryAudio) {
      Alert.alert('Audio Required', 'Record a clip or pick an audio file for this stop.');
      return;
    }

    setSaving(true);
    try {
      const folder = `journeys/${params.journeyId}`;

      const stopAudioPath = await uploadAudioToStorage(
        primaryAudio.uri,
        folder,
        primaryAudio.mimeType
      );

      let handoffAudioPath: string | null = null;
      if (handoffAudio) {
        handoffAudioPath = await uploadAudioToStorage(
          handoffAudio.uri,
          folder,
          handoffAudio.mimeType
        );
      }

      // 1. Insert physical waypoint
      const { data: waypointData, error: wpError } = await supabase
        .from('waypoints')
        .insert({
          title: title.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          site_id: params.siteId || null,
          trigger_type: 'gps',
          trigger_config: {
            radius_meters: radius,
            hysteresis_meters: 20,
          },
        })
        .select()
        .single();

      if (wpError || !waypointData) {
        throw new Error(wpError?.message ?? 'Failed to save waypoint');
      }

      // 2. Insert journey stop linked to that waypoint
      const { error: stopError } = await supabase.from('journey_stops').insert({
        journey_id: params.journeyId,
        waypoint_id: waypointData.id,
        sequence_order: parseInt(params.nextOrder || '1', 10),
        title: title.trim(),
        stop_audio_path: stopAudioPath,
        handoff_audio_path: handoffAudioPath,
        landmark_cue: landmarkCue.trim() || null,
      });

      if (stopError) {
        throw new Error(stopError.message);
      }

      router.back();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Mini Map for Pin Adjustment */}
      <View style={styles.mapBox}>
        <MapView
          style={styles.map}
          initialRegion={{
            ...coords,
            latitudeDelta: 0.0025,
            longitudeDelta: 0.0025,
          }}
          onPress={(e: MapPressEvent) => setCoords(e.nativeEvent.coordinate)}
        >
          <Marker coordinate={coords} />
          <Circle
            center={coords}
            radius={radius}
            fillColor="rgba(16, 185, 129, 0.25)"
            strokeColor="#059669"
            strokeWidth={2}
          />
        </MapView>
        <TouchableOpacity style={styles.snapBtn} onPress={handleSnapToGps}>
          <Ionicons name="locate" size={15} color="#0F172A" />
          <Text style={styles.snapBtnText}>Snap to My GPS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Stop Title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., The Ghost Performance"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Visual Landmark Cue (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Stand on the lawn facing the stone steps"
          value={landmarkCue}
          onChangeText={setLandmarkCue}
        />

        <Text style={styles.label}>Trigger Radius ({radius} meters)</Text>
        <View style={styles.radiusRow}>
          {RADIUS_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
              onPress={() => setRadius(r)}
            >
              <Text style={[styles.radiusText, radius === r && styles.radiusTextActive]}>
                {r} m
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Primary Audio: Record or Upload */}
        <Text style={styles.label}>Primary Stop Audio</Text>
        <View style={styles.audioActions}>
          {recorderState.isRecording ? (
            <TouchableOpacity style={styles.recordingBtn} onPress={handleStopRecording}>
              <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
              <Text style={styles.btnTextWhite}>
                Stop Recording ({Math.round(recorderState.durationMillis / 1000)}s)
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.recordBtn} onPress={handleStartRecording}>
              <Ionicons name="mic" size={18} color="#FFFFFF" />
              <Text style={styles.btnTextWhite}>Record Live</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.uploadBtn} onPress={handlePickPrimaryFile}>
            <Ionicons name="folder-open-outline" size={18} color="#0F172A" />
            <Text style={styles.btnTextDark}>Pick File</Text>
          </TouchableOpacity>
        </View>

        {primaryAudio && (
          <View style={styles.selectedFile}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.selectedFileText} numberOfLines={1}>
              {primaryAudio.label}
            </Text>
          </View>
        )}

        {/* Optional Handoff Clip */}
        <Text style={[styles.label, { marginTop: 14 }]}>
          Spoken Walking Handoff to Next Stop (Optional)
        </Text>
        <TouchableOpacity style={styles.handoffBtn} onPress={handlePickHandoffFile}>
          <Ionicons name="footsteps-outline" size={18} color="#334155" />
          <Text style={styles.handoffBtnText}>
            {handoffAudio ? handoffAudio.label : 'Attach Handoff Audio File'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveStop}
          disabled={saving || recorderState.isRecording}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText}>Save Stop & Upload Audio</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  mapBox: { height: 200, position: 'relative' },
  map: { flex: 1 },
  snapBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
    elevation: 3,
  },
  snapBtnText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  form: { padding: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 14,
  },
  radiusRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  radiusChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  radiusChipActive: { backgroundColor: '#0F172A' },
  radiusText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  radiusTextActive: { color: '#FFFFFF' },
  audioActions: { flexDirection: 'row', gap: 10 },
  recordBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  recordingBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#991B1B',
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  btnTextWhite: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnTextDark: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  selectedFile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  selectedFileText: { fontSize: 13, fontWeight: '600', color: '#065F46', flex: 1 },
  handoffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  handoffBtnText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#059669',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 22,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});