import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { getPublicAudioUrl } from '../utils/supabase';
import { getDistanceMeters } from '../lib/geo';
import { JourneyWithDetails, JourneyStopWithWaypoint } from '../types/journey';

export type EngineState = 'IDLE' | 'IN_TRANSIT' | 'STOP_TRIGGERED' | 'HANDOFF' | 'COMPLETED';

export interface EngineSnapshot {
  journey: JourneyWithDetails | null;
  state: EngineState;
  currentStopIndex: number;
  activeStop: JourneyStopWithWaypoint | null;
  distanceToNext: number | null;
  isPlaying: boolean;
}

type StateListener = (snapshot: EngineSnapshot) => void;

class PlaybackEngine {
  private journey: JourneyWithDetails | null = null;
  private state: EngineState = 'IDLE';
  private currentStopIndex = 0;
  private playedStopIds = new Set<string>();
  private disarmedStopIds = new Set<string>();

  private foregroundPlayer: AudioPlayer | null = null;
  private transitPlayer: AudioPlayer | null = null;
  private localCache = new Map<string, string>();
  private listeners = new Set<StateListener>();
  private lastKnownDistance: number | null = null;
  private isPlaying = false;

  getSnapshot(): EngineSnapshot {
    return {
      journey: this.journey,
      state: this.state,
      currentStopIndex: this.currentStopIndex,
      activeStop: this.journey?.stops[this.currentStopIndex] ?? null,
      distanceToNext: this.lastKnownDistance,
      isPlaying: this.isPlaying,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  async startJourney(journey: JourneyWithDetails): Promise<void> {
    await this.stopJourney();

    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });

    this.journey = {
      ...journey,
      stops: [...journey.stops].sort((a, b) => a.sequence_order - b.sequence_order),
    };
    this.currentStopIndex = 0;
    this.playedStopIds.clear();
    this.disarmedStopIds.clear();

    await this.precacheJourneyAudio(this.journey);

    this.state = this.journey.stops.length > 0 ? 'IN_TRANSIT' : 'COMPLETED';
    this.emit();
  }

  private async precacheJourneyAudio(journey: JourneyWithDetails): Promise<void> {
    const paths = new Set<string>();
    journey.stops.forEach((s) => {
      if (s.stop_audio_path) paths.add(s.stop_audio_path);
      if (s.handoff_audio_path) paths.add(s.handoff_audio_path);
    });
    journey.legs.forEach((l) => {
      if (l.transit_audio_path) paths.add(l.transit_audio_path);
    });

    for (const storagePath of paths) {
      try {
        const safeName = storagePath.replace(/\//g, '_');
        const targetFile = new File(Paths.cache, safeName);

        if (!targetFile.exists) {
          const remoteUrl = getPublicAudioUrl(storagePath);
          const downloaded = await File.downloadFileAsync(remoteUrl, targetFile);
          this.localCache.set(storagePath, downloaded.uri);
        } else {
          this.localCache.set(storagePath, targetFile.uri);
        }
      } catch (err) {
        console.warn(`Audio cache skipped for ${storagePath}, will stream instead:`, err);
      }
    }
  }

  onLocationUpdate(latitude: number, longitude: number): void {
    if (!this.journey || this.state === 'IDLE' || this.state === 'COMPLETED') return;

    const targetStop = this.journey.stops[this.currentStopIndex];
    if (!targetStop?.waypoint) return;

    const dist = getDistanceMeters(
      latitude,
      longitude,
      targetStop.waypoint.latitude,
      targetStop.waypoint.longitude
    );
    this.lastKnownDistance = Math.round(dist);

    const radius = targetStop.waypoint.trigger_config.radius_meters ?? 25;
    const hysteresis = targetStop.waypoint.trigger_config.hysteresis_meters ?? 20;

    // Re-arm stop only after moving radius + hysteresis beyond the pin
    if (this.disarmedStopIds.has(targetStop.id) && dist > radius + hysteresis) {
      this.disarmedStopIds.delete(targetStop.id);
    }

    if (
      this.state === 'IN_TRANSIT' &&
      dist <= radius &&
      !this.playedStopIds.has(targetStop.id) &&
      !this.disarmedStopIds.has(targetStop.id)
    ) {
      this.triggerStop(targetStop);
      return;
    }

    this.emit();
  }

  async triggerStop(stop: JourneyStopWithWaypoint): Promise<void> {
    this.state = 'STOP_TRIGGERED';
    this.playedStopIds.add(stop.id);
    this.disarmedStopIds.add(stop.id);
    this.isPlaying = true;
    this.emit();

    if (this.transitPlayer) {
      this.transitPlayer.pause();
    }

    const uri = this.localCache.get(stop.stop_audio_path) ?? getPublicAudioUrl(stop.stop_audio_path);
    this.foregroundPlayer?.release();
    this.foregroundPlayer = createAudioPlayer({ uri });

    this.foregroundPlayer.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        this.handleStopFinished(stop);
      }
    });

    this.foregroundPlayer.play();
  }

  private handleStopFinished(stop: JourneyStopWithWaypoint): void {
    if (stop.handoff_audio_path) {
      this.state = 'HANDOFF';
      this.isPlaying = true;
      this.emit();

      const handoffUri =
        this.localCache.get(stop.handoff_audio_path) ?? getPublicAudioUrl(stop.handoff_audio_path);
      this.foregroundPlayer?.release();
      this.foregroundPlayer = createAudioPlayer({ uri: handoffUri });

      this.foregroundPlayer.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          this.advanceToNextStop(stop);
        }
      });

      this.foregroundPlayer.play();
    } else {
      this.advanceToNextStop(stop);
    }
  }

  skipToNextStop(): void {
    if (!this.journey) return;
    const currentStop = this.journey.stops[this.currentStopIndex];
    this.foregroundPlayer?.pause();
    this.foregroundPlayer?.release();
    this.foregroundPlayer = null;
    this.isPlaying = false;

    if (currentStop) {
      this.advanceToNextStop(currentStop);
    }
  }

  togglePlayPause(): void {
    const activePlayer =
      this.state === 'STOP_TRIGGERED' || this.state === 'HANDOFF'
        ? this.foregroundPlayer
        : this.transitPlayer;

    if (!activePlayer) return;

    if (this.isPlaying) {
      activePlayer.pause();
      this.isPlaying = false;
    } else {
      activePlayer.play();
      this.isPlaying = true;
    }
    this.emit();
  }

  private advanceToNextStop(completedStop: JourneyStopWithWaypoint): void {
    if (!this.journey) return;

    const nextIndex = this.currentStopIndex + 1;
    if (nextIndex >= this.journey.stops.length) {
      this.state = 'COMPLETED';
      this.isPlaying = false;
      this.lastKnownDistance = null;
      this.emit();
      return;
    }

    const nextStop = this.journey.stops[nextIndex];
    this.currentStopIndex = nextIndex;
    this.state = 'IN_TRANSIT';
    this.lastKnownDistance = null;

    const leg = this.journey.legs.find(
      (l) => l.from_stop_id === completedStop.id && l.to_stop_id === nextStop.id
    );

    if (leg?.transit_audio_path) {
      const transitUri =
        this.localCache.get(leg.transit_audio_path) ?? getPublicAudioUrl(leg.transit_audio_path);
      this.transitPlayer?.release();
      this.transitPlayer = createAudioPlayer({ uri: transitUri });
      this.transitPlayer.loop = true;
      this.transitPlayer.volume = 0.65;
      this.transitPlayer.play();
      this.isPlaying = true;
    } else {
      this.isPlaying = false;
    }

    this.emit();
  }

  async stopJourney(): Promise<void> {
    this.foregroundPlayer?.pause();
    this.foregroundPlayer?.release();
    this.foregroundPlayer = null;

    this.transitPlayer?.pause();
    this.transitPlayer?.release();
    this.transitPlayer = null;

    this.journey = null;
    this.state = 'IDLE';
    this.currentStopIndex = 0;
    this.lastKnownDistance = null;
    this.isPlaying = false;
    this.emit();
  }
}

export const playbackEngine = new PlaybackEngine();