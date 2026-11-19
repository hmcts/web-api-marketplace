import { BackendError, Owner, callBackend } from './Applications';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  lastLoginAt?: string | null;
  applicationCount: number;
}

export interface AdminApplication {
  name: string;
  apiCount: number;
  createdAt: string;
}

export interface AdminProductionRequest {
  reference: string;
  applicationName: string;
  status: string;
  submittedAt: string;
}

export interface AdminUserDetail {
  id: number;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  organisation?: string | null;
  applications: AdminApplication[];
  productionRequests: AdminProductionRequest[];
}

const PATH = '/admin/users';

export async function listAdminUsers(owner: Owner): Promise<AdminUser[]> {
  return callBackend<AdminUser[]>(owner, { method: 'GET', url: PATH });
}

/** Undefined when the backend answers 404: the caller is an admin, so the user id is unknown. */
export async function getAdminUser(owner: Owner, id: number): Promise<AdminUserDetail | undefined> {
  try {
    return await callBackend<AdminUserDetail>(owner, { method: 'GET', url: `${PATH}/${id}` });
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}
