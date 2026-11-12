import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getOrCreateCreatorId } from '../../src/utils/supabase';
import { JourneyRow, LensType } from '../../src/types/journey';

const LENS_OPTIONS: LensType[] = ['historical', 'personal', 'soundscape', 'comedy', 'commercial'];

export default function CreateScreen() {
  const router = useRouter();
  const [journeys, setJourneys] = useState<JourneyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [selectedLens, setSelectedLens] = useState<LensType>('historical');

  const fetchJourneys = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('journeys')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setJourneys(data);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchJourneys();
    }, [fetchJourneys])
  );

  async function handleCreateJourney() {
    if (!newTitle.trim()) {
      Alert.alert('Title Required', 'Give your journey a name before opening the studio.');
      return;
    }

    setCreating(true);
    try {
      const creatorId = await getOrCreateCreatorId();

      // Attach to default site if one exists
      const { data: siteData } = await supabase.from('sites').select('id').limit(1).single();

      const { data, error } = await supabase
        .from('journeys')
        .insert({
          title: newTitle.trim(),
          lens_type: selectedLens,
          mode: 'route',
          visibility: 'public',
          creator_id: creatorId,
          site_id: siteData?.id ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Could not create journey');
      }

      setNewTitle('');
      router.push(`/studio/${data.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.creatorCard}>
        <Text style={styles.sectionTitle}>Start a New Journey</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Sundays at the Cubbon Bandstand"
          placeholderTextColor="#94A3B8"
          value={newTitle}
          onChangeText={setNewTitle}
        />

        <Text style={styles.label}>Perspective Lens</Text>
        <View style={styles.pillRow}>
          {LENS_OPTIONS.map((lens) => {
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
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={handleCreateJourney}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.createBtnText}>Open Journey Studio</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.listHeader}>Your Journeys</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#0F172A" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={journeys}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No journeys yet. Create your first one above.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.journeyCard}
              onPress={() => router.push(`/studio/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.badgeRow}>
                  <Text style={styles.lensBadge}>{item.lens_type.toUpperCase()}</Text>
                  <Text style={styles.visBadge}>{item.visibility.toUpperCase()}</Text>
                </View>
                <Text style={styles.journeyTitle}>{item.title}</Text>
                {item.summary ? (
                  <Text style={styles.journeySummary} numberOfLines={2}>
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
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  creatorCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 12,
  },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  pillActive: { backgroundColor: '#0F172A' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  pillTextActive: { color: '#FFFFFF' },
  createBtn: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 13,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  createBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  listHeader: { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 10 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 20 },
  journeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  lensBadge: { fontSize: 10, fontWeight: '700', color: '#059669' },
  visBadge: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  journeyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  journeySummary: { fontSize: 13, color: '#64748B', marginTop: 2 },
});