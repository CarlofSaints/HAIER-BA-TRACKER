import { readJson, writeJson } from './blob';

export type Role = 'super_admin' | 'admin' | 'client';

export interface User {
  id: string;
  email: string;
  name: string;
  surname: string;
  passwordHash: string;
  role: Role;
  forcePasswordChange: boolean;
  createdAt: string;
}

const BLOB_KEY = 'users.json';

export async function loadUsers(): Promise<User[]> {
  return readJson<User[]>(BLOB_KEY, []);
}

export async function saveUsers(users: User[]): Promise<void> {
  await writeJson(BLOB_KEY, users);
}
