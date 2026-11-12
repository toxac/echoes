import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../database.types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export function getPublicAudioUrl(storagePath: string): string {
  const { data } = supabase.storage.from('echoes-audio').getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Returns the current user ID if signed in, or attempts an anonymous sign-in.
 * Falls back to null if Anonymous Sign-Ins are disabled in Supabase Auth settings.
 */
export async function getOrCreateCreatorId(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user?.id) {
    return sessionData.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    return null;
  }
  return data.user?.id ?? null;
}