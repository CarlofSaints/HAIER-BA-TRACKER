import { readJson, writeJson } from './blob';

export interface ScoringConfig {
  lateCheckinTime: string;   // e.g. "09:10" — check-in after this = late
  earlyCheckoutTime: string; // e.g. "16:50" — check-out before this = early
}

const BLOB_KEY = 'config/scoring.json';
const DEFAULT: ScoringConfig = { lateCheckinTime: '09:10', earlyCheckoutTime: '16:50' };

export async function loadScoringConfig(): Promise<ScoringConfig> {
  return readJson<ScoringConfig>(BLOB_KEY, DEFAULT);
}

export async function saveScoringConfig(config: ScoringConfig): Promise<void> {
  await writeJson(BLOB_KEY, config);
}
