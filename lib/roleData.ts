import { readJson, writeJson } from './blob';

export interface RoleConfig {
  name: string;
  label: string;
  permissions: string[];
}

const BLOB_KEY = 'config/roles.json';

export interface PermissionDef {
  key: string;
  label: string;
  category: string;
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Dashboard
  { key: 'dashboard.view', label: 'View Dashboard', category: 'Dashboard' },
  // KPIs
  { key: 'kpi.visit_analytics', label: 'View Visit Analytics', category: 'KPIs' },
  { key: 'kpi.training', label: 'View Training KPI', category: 'KPIs' },
  { key: 'kpi.sales', label: 'View Sales KPI', category: 'KPIs' },
  { key: 'kpi.display', label: 'View Display KPI', category: 'KPIs' },
  { key: 'kpi.red_flags', label: 'View Red Flags KPI', category: 'KPIs' },
  // Scoring
  { key: 'scores.view', label: 'View Scores', category: 'Scoring' },
  { key: 'scores.manage', label: 'Enter / Edit Scores', category: 'Scoring' },
  { key: 'leaderboard.view', label: 'View Leaderboard', category: 'Scoring' },
  { key: 'scoring_guide.view', label: 'View Scoring Guide', category: 'Scoring' },
  // Data Load
  { key: 'upload.visits', label: 'Upload Visit Data', category: 'Data Load' },
  { key: 'upload.dispo', label: 'Upload DISPO Data', category: 'Data Load' },
  { key: 'upload.training', label: 'Upload Training Data', category: 'Data Load' },
  { key: 'upload.targets', label: 'Upload Target Data', category: 'Data Load' },
  { key: 'upload.display', label: 'Upload Display Data', category: 'Data Load' },
  { key: 'upload.red_flags', label: 'Upload Red Flag Data', category: 'Data Load' },
  // Administration
  { key: 'users.view', label: 'View Users', category: 'Administration' },
  { key: 'users.manage', label: 'Create / Edit / Delete Users', category: 'Administration' },
  { key: 'bas.view', label: 'View BA Management', category: 'Administration' },
  { key: 'bas.manage', label: 'Manage BAs', category: 'Administration' },
  { key: 'stores.view', label: 'View Stores', category: 'Administration' },
  { key: 'stores.manage', label: 'Manage Stores', category: 'Administration' },
  { key: 'channels.view', label: 'View Sales Channels', category: 'Administration' },
  { key: 'channels.manage', label: 'Manage Sales Channels', category: 'Administration' },
  { key: 'kpi_controls.view', label: 'View KPI Controls', category: 'Administration' },
  { key: 'kpi_controls.manage', label: 'Manage KPI Controls', category: 'Administration' },
  { key: 'reminders.view', label: 'View Reminders', category: 'Administration' },
  { key: 'reminders.manage', label: 'Manage Reminders', category: 'Administration' },
  { key: 'activity_log.view', label: 'View Activity Log', category: 'Administration' },
  // System
  { key: 'site_guide.view', label: 'View Site Guide', category: 'System' },
  { key: 'roles.manage', label: 'Manage Roles & Permissions', category: 'System' },
  { key: 'settings.view', label: 'View Settings', category: 'System' },
  { key: 'settings.manage', label: 'Edit Settings', category: 'System' },
];

export const PERMISSION_CATEGORIES = [...new Set(ALL_PERMISSIONS.map(p => p.category))];

const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map(p => p.key);

const DEFAULT_ROLES: RoleConfig[] = [
  {
    name: 'super_admin',
    label: 'Super Admin',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    name: 'admin',
    label: 'Admin',
    permissions: ALL_PERMISSION_KEYS.filter(k => !['channels.manage', 'roles.manage', 'settings.manage'].includes(k)),
  },
  {
    name: 'client',
    label: 'Client',
    permissions: [
      'dashboard.view', 'leaderboard.view', 'kpi.visit_analytics', 'kpi.sales',
      'kpi.display', 'scoring_guide.view', 'site_guide.view',
    ],
  },
];

export async function loadRoles(): Promise<RoleConfig[]> {
  const roles = await readJson<RoleConfig[]>(BLOB_KEY, []);
  return roles.length > 0 ? roles : DEFAULT_ROLES;
}

export async function saveRoles(roles: RoleConfig[]): Promise<void> {
  await writeJson(BLOB_KEY, roles);
}
