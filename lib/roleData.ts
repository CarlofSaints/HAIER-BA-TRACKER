import { readJson, writeJson } from './blob';

export interface RoleConfig {
  name: string;
  label: string;
  permissions: string[];
}

const BLOB_KEY = 'config/roles.json';

export const ALL_PERMISSIONS = [
  { key: 'dashboard.view', label: 'View Dashboard' },
  { key: 'upload.visits', label: 'Upload Visit Data' },
  { key: 'users.view', label: 'View Users' },
  { key: 'users.manage', label: 'Create / Edit / Delete Users' },
  { key: 'roles.manage', label: 'Manage Roles & Permissions' },
  { key: 'settings.view', label: 'View Settings' },
  { key: 'settings.manage', label: 'Edit Settings' },
];

const DEFAULT_ROLES: RoleConfig[] = [
  {
    name: 'super_admin',
    label: 'Super Admin',
    permissions: ALL_PERMISSIONS.map(p => p.key),
  },
  {
    name: 'admin',
    label: 'Admin',
    permissions: ['dashboard.view', 'upload.visits', 'users.view', 'users.manage'],
  },
  {
    name: 'client',
    label: 'Client',
    permissions: ['dashboard.view'],
  },
];

export async function loadRoles(): Promise<RoleConfig[]> {
  const roles = await readJson<RoleConfig[]>(BLOB_KEY, []);
  return roles.length > 0 ? roles : DEFAULT_ROLES;
}

export async function saveRoles(roles: RoleConfig[]): Promise<void> {
  await writeJson(BLOB_KEY, roles);
}
