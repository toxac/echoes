import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import MapView, { Marker, Circle, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { playbackEngine, EngineSnapshot } from '../../src/engine/PlaybackEngine';
import { stopLocationTracking } from '../../src/engine/LocationTask';
import { TriggerConfig } from '../../src/types/journey';

export default function CurrentJourneyScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() =>
    playbackEngine.getSnapshot()
  );

  useEffect(() => {
    return playbackEngine.subscribe(setSnapshot);
  }, []);

  async function handleEndJourney() {
    await stopLocationTracking();
    await playbackEngine.stopJourney();
  }

  async function handleSimulateArrival() {
    if (!snapshot.activeStop) return;
    await playbackEngine.triggerStop(snapshot.activeStop);
  }

  if (!snapshot.journey || snapshot.state === 'IDLE') {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="headset-outline" size={48} color="#94A3B8" />
        <Text style={styles.emptyTitle}>No Active Journey</Text>
        <Text style={styles.emptySubtitle}>
          Choose a journey from Explore or build your own in Create to begin walking with sound.
        </Text>
        <TouchableOpacity
          style={styles.exploreBtn}
          onPress={() => router.push('/(tabs)/explore')}
        >
          <Text style={styles.exploreBtnText}>Browse Journeys</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { journey, state, activeStop, currentStopIndex, distanceToNext, isPlaying } = snapshot;

  const routeCoords = journey.stops
    .filter((s) => s.waypoint)
    .map((s) => ({
      latitude: s.waypoint!.latitude,
      longitude: s.waypoint!.longitude,
    }));

  const focusCoords = activeStop?.waypoint
    ? {
        latitude: activeStop.waypoint.latitude,
        longitude: activeStop.waypoint.longitude,
      }
    : routeCoords[0] ?? { latitude: 12.9765, longitude: 77.5925 };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          ...focusCoords,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        }}
        showsUserLocation
      >
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor="#0F172A" strokeWidth={3} />
        )}
        {journey.stops.map((stop, idx) => {
          if (!stop.waypoint) return null;
          const isTarget = idx === currentStopIndex && state !== 'COMPLETED';
          const radius = (stop.waypoint.trigger_config as TriggerConfig)?.radius_meters ?? 25;
          return (
            <React.Fragment key={stop.id}>
              <Marker
                coordinate={{
                  latitude: stop.waypoint.latitude,
                  longitude: stop.waypoint.longitude,
                }}
                pinColor={isTarget ? '#059669' : '#64748B'}
                title={`${stop.sequence_order}. ${stop.title}`}
              />
              <Circle
                center={{
                  latitude: stop.waypoint.latitude,
                  longitude: stop.waypoint.longitude,
                }}
                radius={radius}
                fillColor={
                  isTarget ? 'rgba(16, 185, 129, 0.28)' : 'rgba(100, 116, 139, 0.12)'
                }
                strokeColor={isTarget ? '#059669' : '#94A3B8'}
                strokeWidth={2}
              />
            </React.Fragment>
          );
        })}
      </MapView>

      <View style={styles.cockpit}>
        <View style={styles.statusHeader}>
          <View style={styles.statePill}>
            <Text style={styles.statePillText}>{state}</Text>
          </View>
          <Text style={styles.progressText}>
            Stop {Math.min(currentStopIndex + 1, journey.stops.length)} of {journey.stops.length}
          </Text>
        </View>

        <Text style={styles.journeyTitle}>{journey.title}</Text>

        {state === 'COMPLETED' ? (
          <View style={styles.completedBox}>
            <Text style={styles.completedTitle}>Journey Completed</Text>
            <Text style={styles.completedSub}>
              You have experienced all echoes along this route.
            </Text>
          </View>
        ) : activeStop ? (
          <View style={styles.targetCard}>
            <Text style={styles.targetLabel}>
              {state === 'STOP_TRIGGERED' || state === 'HANDOFF'
                ? 'NOW PLAYING'
                : 'NEXT WAYPOINT'}
            </Text>
            <Text style={styles.targetTitle}>{activeStop.title}</Text>
            {activeStop.landmark_cue ? (
              <Text style={styles.targetCue}>{activeStop.landmark_cue}</Text>
            ) : null}
            <Text style={styles.distanceText}>
              Distance:{' '}
              {distanceToNext !== null ? `${distanceToNext} meters` : 'Waiting for GPS fix...'}
            </Text>
          </View>
        ) : null}

        {/* Playback Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => playbackEngine.togglePlayPause()}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#0F172A" />
            <Text style={styles.controlLabel}>{isPlaying ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => playbackEngine.skipToNextStop()}
            disabled={state === 'COMPLETED'}
          >
            <Ionicons name="play-skip-forward" size={20} color="#0F172A" />
            <Text style={styles.controlLabel}>Skip Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endBtn} onPress={handleEndJourney}>
            <Ionicons name="stop-circle-outline" size={20} color="#DC2626" />
            <Text style={styles.endLabel}>End</Text>
          </TouchableOpacity>
        </View>

        {/* Desk Testing Trigger */}
        {state !== 'COMPLETED' && activeStop && (
          <TouchableOpacity style={styles.simBtn} onPress={handleSimulateArrival}>
            <Ionicons name="radio-outline" size={18} color="#FFFFFF" />
            <Text style={styles.simBtnText}>Desk Test: Simulate Arrival at Stop</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    backgroundColor: '#F8FAFC',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginTop: 12 },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
    marginBottom: 20,
  },
  exploreBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
  },
  exploreBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  map: { flex: 1 },
  cockpit: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statePillText: { fontSize: 11, fontWeight: '800', color: '#059669' },
  progressText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  journeyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  targetCard: {
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  targetLabel: { fontSize: 10, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },
  targetTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  targetCue: { fontSize: 13, color: '#475569', marginTop: 2 },
  distanceText: { fontSize: 12, fontWeight: '700', color: '#1E293B', marginTop: 6 },
  completedBox: {
    backgroundColor: '#ECFDF5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  completedTitle: { fontSize: 15, fontWeight: '700', color: '#065F46' },
  completedSub: { fontSize: 13, color: '#047857', marginTop: 2 },
  controlsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  controlLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  endBtn: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  endLabel: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  simBtn: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 13,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  simBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});