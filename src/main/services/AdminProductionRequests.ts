import { AdminApplicationOwner } from './AdminApplications';
import { BackendError, Owner, callBackend } from './Applications';

export interface AdminProductionRequestSummary {
  reference: string;
  applicationId?: number | null;
  applicationName: string;
  organisation: string;
  submittedAt: string;
  status: string;
}

export interface AdminProductionRequestDetail {
  reference: string;
  status: string;
  submittedAt: string;
  requester?: AdminApplicationOwner | null;
  organisation: string;
  applicationId?: number | null;
  applicationName: string;
  apis: string[];
  goLiveDate: string;
  callVolume: string;
  dataRequest?: string | null;
  proposedOutputs?: string | null;
  organisationType?: string | null;
  dataRecipients?: string[];
  dataRecipientsExplanation?: string | null;
  dataCombined?: string | null;
  dataCombinedDescription?: string | null;
}

const PATH = '/admin/production-requests';

export async function listAdminProductionRequests(owner: Owner): Promise<AdminProductionRequestSummary[] | undefined> {
  try {
    return await callBackend<AdminProductionRequestSummary[]>(owner, { method: 'GET', url: PATH });
  } catch (error) {
    if (hasStatus(error, 403)) {
      return undefined;
    }
    throw error;
  }
}

export async function getAdminProductionRequest(
  owner: Owner,
  reference: string
): Promise<AdminProductionRequestDetail | undefined> {
  try {
    return await callBackend<AdminProductionRequestDetail>(owner, {
      method: 'GET',
      url: `${PATH}/${encodeURIComponent(reference)}`,
    });
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
