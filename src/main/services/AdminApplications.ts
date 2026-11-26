import { AdminProductionRequest } from './AdminUsers';
import { BackendError, Owner, callBackend } from './Applications';

export interface AdminApplicationOwner {
  id: number;
  name: string;
  email: string;
}

export interface AdminApplicationSummary {
  id: number;
  name: string;
  owner?: AdminApplicationOwner | null;
  apiCount: number;
  createdAt: string;
  productionRequested: boolean;
}

export interface AdminApplicationDetail {
  id: number;
  name: string;
  clientId: string;
  createdAt: string;
  owner?: AdminApplicationOwner | null;
  apis: string[];
  productionRequest?: AdminProductionRequest | null;
}

const PATH = '/admin/applications';

export async function listAdminApplications(owner: Owner): Promise<AdminApplicationSummary[] | undefined> {
  try {
    return await callBackend<AdminApplicationSummary[]>(owner, { method: 'GET', url: PATH });
  } catch (error) {
    if (hasStatus(error, 403)) {
      return undefined;
    }
    throw error;
  }
}

export async function getAdminApplication(owner: Owner, id: number): Promise<AdminApplicationDetail | undefined> {
  try {
    return await callBackend<AdminApplicationDetail>(owner, { method: 'GET', url: `${PATH}/${id}` });
  } catch (error) {
    if (hasStatus(error, 403, 404)) {
      return undefined;
    }
    throw error;
  }
}

function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof BackendError && error.status !== undefined && statuses.includes(error.status);
}
