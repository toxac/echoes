import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/utils/supabase';
import { JourneyWithDetails, LensType, TriggerConfig } from '../../src/types/journey';

const LENS_FILTERS: ('all' | LensType)[] = [
  'all',
  'historical',
  'personal',
  'soundscape',
  'comedy',
  'commercial',
];

export default function ExploreScreen() {
  const router = useRouter();
  const [journeys, setJourneys] = useState<JourneyWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLens, setSelectedLens] = useState<'all' | LensType>('all');

  const fetchJourneys = useCallback(async () => {
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
      .order('created_at', { ascending: false });

    if (!error && data) {
      const normalized = data.map((j) => ({
        ...j,
        stops: [...(j.stops ?? [])].sort((a, b) => a.sequence_order - b.sequence_order),
      })) as unknown as JourneyWithDetails[];
      setJourneys(normalized);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchJourneys();
    }, [fetchJourneys])
  );

  const filteredJourneys = useMemo(() => {
    return journeys.filter((j) => {
      const matchesLens = selectedLens === 'all' || j.lens_type === selectedLens;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchesLens;

      const inTitle = j.title.toLowerCase().includes(q);
      const inSummary = (j.summary ?? '').toLowerCase().includes(q);
      const inStops = j.stops.some(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.waypoint?.title ?? '').toLowerCase().includes(q)
      );
      return matchesLens && (inTitle || inSummary || inStops);
    });
  }, [journeys, selectedLens, searchQuery]);

  const firstPin = useMemo(() => {
    for (const j of filteredJourneys) {
      const wp = j.stops.find((s) => s.waypoint)?.waypoint;
      if (wp) return { latitude: wp.latitude, longitude: wp.longitude };
    }
    return { latitude: 12.9765, longitude: 77.5925 };
  }, [filteredJourneys]);

  return (
    <View style={styles.container}>
      {/* Search & Lens Filter Header */}
      <View style={styles.filterHeader}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search places, stories, or lenses..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillScroll}
        >
          {LENS_FILTERS.map((lens) => {
            const active = selectedLens === lens;
            return (
              <TouchableOpacity
                key={lens}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setSelectedLens(lens)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {lens.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Map Preview of Echoes */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          initialRegion={{
            ...firstPin,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          }}
          showsUserLocation
        >
          {filteredJourneys.map((journey) =>
            journey.stops.map((stop) => {
              if (!stop.waypoint) return null;
              const radius = (stop.waypoint.trigger_config as TriggerConfig)?.radius_meters ?? 25;
              return (
                <React.Fragment key={stop.id}>
                  <Marker
                    coordinate={{
                      latitude: stop.waypoint.latitude,
                      longitude: stop.waypoint.longitude,
                    }}
                    title={journey.title}
                    description={`Stop ${stop.sequence_order}: ${stop.title}`}
                    onCalloutPress={() => router.push(`/journey/${journey.id}`)}
                  />
                  <Circle
                    center={{
                      latitude: stop.waypoint.latitude,
                      longitude: stop.waypoint.longitude,
                    }}
                    radius={radius}
                    fillColor="rgba(16, 185, 129, 0.18)"
                    strokeColor="rgba(16, 185, 129, 0.75)"
                    strokeWidth={1.5}
                  />
                </React.Fragment>
              );
            })
          )}
        </MapView>
      </View>

      {/* Journey Cards */}
      {loading ? (
        <ActivityIndicator size="large" color="#0F172A" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredJourneys}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No journeys match your filter. Create one in the Create tab!
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/journey/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.badgeRow}>
                  <Text style={styles.lensBadge}>{item.lens_type.toUpperCase()}</Text>
                  <Text style={styles.stopCountBadge}>
                    {item.stops.length} {item.stops.length === 1 ? 'STOP' : 'STOPS'}
                  </Text>
                  {item.visibility !== 'public' && (
                    <Text style={styles.privateBadge}>{item.visibility.toUpperCase()}</Text>
                  )}
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.summary ? (
                  <Text style={styles.cardSummary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#64748B" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  filterHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  pillScroll: { gap: 6 },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  pillActive: { backgroundColor: '#0F172A' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  pillTextActive: { color: '#FFFFFF' },
  mapContainer: { height: 220 },
  map: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 30 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 24, fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  lensBadge: { fontSize: 10, fontWeight: '700', color: '#059669' },
  stopCountBadge: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  privateBadge: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  cardSummary: { fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 18 },
});