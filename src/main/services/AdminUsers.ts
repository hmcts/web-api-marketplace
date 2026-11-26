import { Logger } from '../modules/logging';

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

const logger = Logger.getLogger('admin-users');

export async function listAdminUsers(owner: Owner): Promise<AdminUser[] | undefined> {
  try {
    return await callBackend<AdminUser[]>(owner, { method: 'GET', url: PATH });
  } catch (error) {
    if (hasStatus(error, 403)) {
      // The page answers "not found" either way, so without this the whole refusal is silent:
      // the web believed the caller was an admin and the service did not.
      logger.warn(`The service refused ${owner.oid} the user list: the token holds no admin role`);
      return undefined;
    }
    throw error;
  }
}

export async function getAdminUser(owner: Owner, id: number): Promise<AdminUserDetail | undefined> {
  try {
    return await callBackend<AdminUserDetail>(owner, { method: 'GET', url: `${PATH}/${id}` });
  } catch (error) {
    if (hasStatus(error, 403, 404)) {
      // The page answers "not found" either way, so without this the whole refusal is silent:
      // a missing user and a refused caller leave the same trace otherwise.
      logger.warn(`The service answered ${(error as BackendError).status} for user ${id}`);
      return undefined;
    }
    throw error;
  }
}

function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof BackendError && error.status !== undefined && statuses.includes(error.status);
}
