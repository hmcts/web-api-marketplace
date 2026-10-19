import axios, { AxiosRequestConfig } from 'axios';
import config from 'config';

import { BackendError, Owner } from './Applications';

export interface ProductionRequestSummary {
  reference: string;
  status: string;
  submittedAt: string;
}

export interface ProductionRequestDetail extends ProductionRequestSummary {
  applicationName: string;
  clientId: string | null;
  organisation: string;
  goLiveDate: string;
  callVolume: string;
  dataRequest: string;
  proposedOutputs: string;
}

export interface ProductionRequestSubmission {
  clientId: string;
  organisation: string;
  goLiveDate: string;
  callVolume: string;
  dataRequest: string;
  proposedOutputs: string;
}

const PATH = '/production-requests';

export async function listProductionRequests(owner: Owner): Promise<ProductionRequestSummary[]> {
  return call<ProductionRequestSummary[]>(owner, { method: 'GET', url: PATH });
}

/** Undefined when the reference is not this user's, which the backend answers the same as unknown. */
export async function getProductionRequest(
  owner: Owner,
  reference: string
): Promise<ProductionRequestDetail | undefined> {
  try {
    return await call<ProductionRequestDetail>(owner, {
      method: 'GET',
      url: `${PATH}/${encodeURIComponent(reference)}`,
    });
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function submitProductionRequest(
  owner: Owner,
  submission: ProductionRequestSubmission
): Promise<ProductionRequestSummary> {
  return call<ProductionRequestSummary>(owner, { method: 'POST', url: PATH, data: submission });
}

async function call<T>(owner: Owner, request: AxiosRequestConfig, timeout = 10000): Promise<T> {
  const baseURL = process.env.API_URL || config.get<string>('backend.url');

  try {
    const response = await axios.request<T>({
      ...request,
      baseURL,
      timeout,
      headers: { requestingUserId: owner.oid },
    });
    return response.data;
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: { error?: string } } }).response;
    if (response?.status) {
      throw new BackendError(response.data?.error || `The backend answered ${response.status}`, response.status);
    }
    throw new BackendError(`Could not reach the backend: ${(error as Error).message}`);
  }
}
