import { readJson, writeJson } from './blob';

export interface KPIControls {
  minTrainingsPerMonth: number; // minimum completed trainings per month for full auto-score
  minVisitsPerMonth: number;    // minimum store visits per BA per month
}

const BLOB_KEY = 'config/kpi-controls.json';
const DEFAULT: KPIControls = { minTrainingsPerMonth: 4, minVisitsPerMonth: 20 };

export async function loadKPIControls(): Promise<KPIControls> {
  return readJson<KPIControls>(BLOB_KEY, DEFAULT);
}

export async function saveKPIControls(config: KPIControls): Promise<void> {
  await writeJson(BLOB_KEY, config);
}
