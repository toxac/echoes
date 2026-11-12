import { Tables, TablesInsert, TablesUpdate } from '../../database.types';

export type LensType = 'historical' | 'comedy' | 'soundscape' | 'personal' | 'commercial';
export type JourneyMode = 'route' | 'free_roam';
export type VisibilityTier = 'private' | 'shared' | 'public';
export type TriggerType = 'gps' | 'ble' | 'nfc';

export interface TriggerConfig {
  radius_meters?: number;
  hysteresis_meters?: number;
  beacon_uuid?: string;
  rssi_threshold?: number;
  nfc_tag_id?: string;
}

// Base Row Types
export type SiteRow = Tables<'sites'>;
export type JourneyRow = Tables<'journeys'>;
export type JourneyStopRow = Tables<'journey_stops'>;
export type JourneyLegRow = Tables<'journey_legs'>;

export type WaypointRow = Omit<Tables<'waypoints'>, 'trigger_config' | 'trigger_type'> & {
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
};

// Insert & Update Types
export type NewSiteInput = TablesInsert<'sites'>;
export type NewWaypointInput = TablesInsert<'waypoints'>;
export type NewJourneyInput = TablesInsert<'journeys'>;
export type UpdateJourneyInput = TablesUpdate<'journeys'>;
export type NewJourneyStopInput = TablesInsert<'journey_stops'>;
export type NewJourneyLegInput = TablesInsert<'journey_legs'>;

// Nested Query Types
export type JourneyStopWithWaypoint = JourneyStopRow & {
  waypoint: WaypointRow | null;
};

export type JourneyWithDetails = JourneyRow & {
  site?: SiteRow | null;
  stops: JourneyStopWithWaypoint[];
  legs: JourneyLegRow[];
};