import { readJson, writeJson } from './blob';

/** Which pipeline supplies a (sub-)channel's sales/stock data. */
export type ChannelDataSource = 'sams' | 'dispo' | 'excel';

export interface Channel {
  id: string;
  name: string;
  /** If set, this channel is a sub-channel of the parent */
  parentId?: string;
  /** Data source for this (sub-)channel's sales/stock. Meaningful at the
   *  sub-channel level (stores are assigned to sub-channels). Defaults to
   *  'dispo' for channels created before this field existed. */
  dataSource?: ChannelDataSource;
}

/** The data source for a given channel id (defaults to 'dispo'). */
export function channelDataSource(
  channels: Channel[],
  channelId: string | undefined,
): ChannelDataSource {
  if (!channelId) return 'dispo';
  return channels.find(c => c.id === channelId)?.dataSource ?? 'dispo';
}

const BLOB_KEY = 'admin/channels.json';

const DEFAULT_CHANNELS: Channel[] = [
  { id: 'massmart', name: 'MASSMART' },
  { id: 'makro', name: 'MAKRO', parentId: 'massmart' },
  { id: 'walmart', name: 'WALMART' },
  { id: 'dc', name: 'DC' },
];

/** Get only top-level (main) channels */
export function getMainChannels(channels: Channel[]): Channel[] {
  return channels.filter(c => !c.parentId);
}

/** Get sub-channels for a given parent */
export function getSubChannels(channels: Channel[], parentId: string): Channel[] {
  return channels.filter(c => c.parentId === parentId);
}

/** Resolve the main channel for a given channel ID (walks up if sub-channel) */
export function resolveMainChannel(channels: Channel[], channelId: string): Channel | undefined {
  const ch = channels.find(c => c.id === channelId);
  if (!ch) return undefined;
  if (ch.parentId) return channels.find(c => c.id === ch.parentId);
  return ch;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Ensure a main channel (+ optional sub-channel) exists, matched by name
 * (case-insensitive); creates any missing, mutating `channels`. Returns the id a
 * store should be assigned to (sub id when subName given, else main id) plus the
 * display names of any channels created. Used by the Site Control File upload.
 */
export function ensureChannelPath(
  channels: Channel[],
  mainName: string,
  subName?: string,
): { channelId: string; created: string[] } {
  const created: string[] = [];
  const mn = (mainName || '').trim();
  if (!mn) return { channelId: '', created };

  const takenIds = new Set(channels.map(c => c.id));
  const uniqueId = (base: string): string => {
    let id = base || 'channel';
    let n = 2;
    while (takenIds.has(id)) id = `${base}-${n++}`;
    takenIds.add(id);
    return id;
  };

  let main = channels.find(c => !c.parentId && c.name.toUpperCase() === mn.toUpperCase());
  if (!main) {
    main = { id: uniqueId(slugify(mn)), name: mn.toUpperCase() };
    channels.push(main);
    created.push(main.name);
  }

  const sn = (subName || '').trim();
  if (!sn) return { channelId: main.id, created };

  let sub = channels.find(c => c.parentId === main!.id && c.name.toUpperCase() === sn.toUpperCase());
  if (!sub) {
    sub = { id: uniqueId(slugify(`${mn}-${sn}`)), name: sn.toUpperCase(), parentId: main.id };
    channels.push(sub);
    created.push(`${main.name} › ${sub.name}`);
  }
  return { channelId: sub.id, created };
}

export async function loadChannels(): Promise<Channel[]> {
  return readJson<Channel[]>(BLOB_KEY, DEFAULT_CHANNELS);
}

export async function saveChannels(channels: Channel[]): Promise<void> {
  await writeJson(BLOB_KEY, channels);
}
