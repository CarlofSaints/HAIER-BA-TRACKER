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
  // Leaderboard
  { key: 'dashboard.view', label: 'View Dashboard', category: 'Leaderboard' },
  { key: 'leaderboard.view', label: 'View Leaderboard', category: 'Leaderboard' },
  // KPIs
  { key: 'kpi.visit_analytics', label: 'View Visit Analytics', category: 'KPIs' },
  { key: 'kpi.training', label: 'View Training KPI', category: 'KPIs' },
  { key: 'kpi.sales', label: 'View Sales KPI', category: 'KPIs' },
  { key: 'kpi.display', label: 'View Display KPI', category: 'KPIs' },
  { key: 'kpi.red_flags', label: 'View Red Flags KPI', category: 'KPIs' },
  // Score Entry
  { key: 'scores.view', label: 'View Scores', category: 'Score Entry' },
  { key: 'scores.manage', label: 'Enter / Edit Scores', category: 'Score Entry' },
  { key: 'scoring_guide.view', label: 'View Scoring Guide', category: 'Score Entry' },
  // Data Load
  { key: 'upload.visits', label: 'Upload Visit Data', category: 'Data Load' },
  { key: 'upload.dispo', label: 'Upload DISPO Data', category: 'Data Load' },
  { key: 'upload.training', label: 'Upload Training Data', category: 'Data Load' },
  { key: 'upload.targets', label: 'Upload Target Data', category: 'Data Load' },
  { key: 'upload.display', label: 'Upload Display Data', category: 'Data Load' },
  { key: 'upload.red_flags', label: 'Upload Red Flag Data', category: 'Data Load' },
  // Users
  { key: 'users.view', label: 'View Users', category: 'Users' },
  { key: 'users.manage', label: 'Create / Edit / Delete Users', category: 'Users' },
  // BA Management
  { key: 'bas.view', label: 'View BA Management', category: 'BA Management' },
  { key: 'bas.manage', label: 'Manage BAs', category: 'BA Management' },
  // Stores
  { key: 'stores.view', label: 'View Stores', category: 'Stores' },
  { key: 'stores.manage', label: 'Manage Stores', category: 'Stores' },
  // Sales Channels
  { key: 'channels.view', label: 'View Sales Channels', category: 'Sales Channels' },
  { key: 'channels.manage', label: 'Manage Sales Channels', category: 'Sales Channels' },
  // KPI Controls
  { key: 'kpi_controls.view', label: 'View KPI Controls', category: 'KPI Controls' },
  { key: 'kpi_controls.manage', label: 'Manage KPI Controls', category: 'KPI Controls' },
  // Reminders
  { key: 'reminders.view', label: 'View Reminders', category: 'Reminders' },
  { key: 'reminders.manage', label: 'Manage Reminders', category: 'Reminders' },
  // Activity Log
  { key: 'activity_log.view', label: 'View Activity Log', category: 'Activity Log' },
  // Site Guide
  { key: 'site_guide.view', label: 'View Site Guide', category: 'Site Guide' },
  // Settings
  { key: 'settings.view', label: 'View Settings', category: 'Settings' },
  { key: 'settings.manage', label: 'Edit Settings', category: 'Settings' },
  // Roles
  { key: 'roles.manage', label: 'Manage Roles & Permissions', category: 'Roles' },
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
