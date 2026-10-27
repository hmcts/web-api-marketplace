import { BackendError, Owner, callBackend } from './Applications';

export interface ProductionRequestSummary {
  reference: string;
  status: string;
  submittedAt: string;
  /** Null once the application it was made for has been deleted. */
  clientId: string | null;
  applicationName: string;
}

export interface ProductionRequestDetail extends ProductionRequestSummary {
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
  return callBackend<ProductionRequestSummary[]>(owner, { method: 'GET', url: PATH });
}

/** Undefined when the reference is not this user's, which the backend answers the same as unknown. */
export async function getProductionRequest(
  owner: Owner,
  reference: string
): Promise<ProductionRequestDetail | undefined> {
  try {
    return await callBackend<ProductionRequestDetail>(owner, {
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
  return callBackend<ProductionRequestSummary>(owner, { method: 'POST', url: PATH, data: submission });
}
