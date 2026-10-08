import axios from 'axios';

import { Logger } from '../modules/logging';

import { logSubmission, submissionEndpoint } from './submissions';

const logger = Logger.getLogger('backend-applications');

const APPLICATIONS_PATH = '/applications';

/**
 * Registering an application makes an Entra app registration through Microsoft Graph,
 * which the backend retries while Graph catches up with itself, then one APIM call per
 * API. That is several round trips to Azure, so it is given far longer than a read.
 */
const REGISTER_TIMEOUT_MS = 60000;
const LIST_TIMEOUT_MS = 10000;

/** One API on an application, as service-api-marketplace returns it. */
export interface BackendApiCredential {
  apiShortCode: string;
  publisherId: string;
  subscriptionKey: string;
}

/** An application as service-api-marketplace returns it from GET and POST /applications. */
export interface BackendApplication {
  id: number;
  name: string;
  environment: string;
  clientId: string;
  /** Only on the response that created the application. Entra never shows it again. */
  clientSecret?: string | null;
  apiCredentials: BackendApiCredential[];
}

export interface RegistrationRequest {
  name: string;
  environment: string;
  /** The catalogue names of the APIs, which the backend maps to APIM products. */
  apiShortCodes: string[];
}

/**
 * The backend could not list or create applications. Thrown rather than answered with an
 * empty list: "you have no applications" would be untrue, and would invite the user to
 * create one they already have.
 */
export class ApplicationsUnavailableError extends Error {}

export async function fetchApplications(userId: number): Promise<BackendApplication[]> {
  const url = submissionEndpoint(APPLICATIONS_PATH);

  try {
    const response = await axios.get<BackendApplication[]>(url, {
      timeout: LIST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: { requestingUserId: String(userId) },
    });

    if (response.status !== 200 || !Array.isArray(response.data)) {
      logger.error(`Listing applications returned ${response.status} from ${url}`);
      throw new ApplicationsUnavailableError(`Listing applications returned ${response.status}`);
    }

    return response.data;
  } catch (error) {
    if (error instanceof ApplicationsUnavailableError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Listing applications from ${url} failed: ${reason}`);
    throw new ApplicationsUnavailableError(reason);
  }
}

export async function registerApplication(userId: number, request: RegistrationRequest): Promise<BackendApplication> {
  const url = submissionEndpoint(APPLICATIONS_PATH);

  logSubmission(logger, 'Register application', APPLICATIONS_PATH);

  try {
    const response = await axios.post<BackendApplication>(url, request, {
      timeout: REGISTER_TIMEOUT_MS,
      validateStatus: () => true,
      headers: { requestingUserId: String(userId) },
    });

    if (response.status === 201 && response.data?.clientSecret) {
      logger.info(`Registered application ${response.data.id} at ${url}`);
      return response.data;
    }

    // Without its secret the application is unusable, and the secret cannot be read back.
    if (response.status === 201) {
      logger.error(`Register application at ${url} answered 201 with no client secret`);
      throw new ApplicationsUnavailableError('Register application returned no client secret');
    }

    // The backend's own message goes in the log, not on the page: a 400 here names the API
    // it has no APIM product for, and a 503 names the credential it is missing - both are
    // for whoever runs the service, not for the person registering.
    const detail = (response.data as { error?: string } | undefined)?.error ?? '';
    logger.error(`Register application rejected with status ${response.status} from ${url}: ${detail}`);
    throw new ApplicationsUnavailableError(`Register application returned ${response.status}`);
  } catch (error) {
    if (error instanceof ApplicationsUnavailableError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Register application to ${url} failed: ${reason}`);
    throw new ApplicationsUnavailableError(reason);
  }
}
