import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { supabase } from '../utils/supabase';

export interface PickedAudioFile {
  uri: string;
  name: string;
  mimeType: string;
}

export async function pickLocalAudioFile(): Promise<PickedAudioFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'audio/mp4',
  };
}

/**
 * Reads a local file URI (from mic recording or document picker) as bytes
 * and uploads it to Supabase Storage under `echoes-audio/{folder}/{filename}`.
 * Returns the storage path to save in `journey_stops` or `journey_legs`.
 */
export async function uploadAudioToStorage(
  localUri: string,
  folder: string,
  mimeType = 'audio/mp4'
): Promise<string> {
  const extension = mimeType.includes('mpeg') || localUri.endsWith('.mp3')
    ? 'mp3'
    : mimeType.includes('wav') || localUri.endsWith('.wav')
    ? 'wav'
    : 'm4a';

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const storagePath = `${folder}/${fileName}`;

  const localFile = new File(localUri);
  const bytes = await localFile.bytes();

  const { error } = await supabase.storage
    .from('echoes-audio')
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Audio upload failed: ${error.message}`);
  }

  return storagePath;
}