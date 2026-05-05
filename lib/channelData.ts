import { readJson, writeJson } from './blob';

export interface Channel {
  id: string;
  name: string;
}

const BLOB_KEY = 'admin/channels.json';

const DEFAULT_CHANNELS: Channel[] = [
  { id: 'makro', name: 'MAKRO' },
  { id: 'walmart', name: 'WALMART' },
  { id: 'dc', name: 'DC' },
];

export async function loadChannels(): Promise<Channel[]> {
  return readJson<Channel[]>(BLOB_KEY, DEFAULT_CHANNELS);
}

export async function saveChannels(channels: Channel[]): Promise<void> {
  await writeJson(BLOB_KEY, channels);
}
