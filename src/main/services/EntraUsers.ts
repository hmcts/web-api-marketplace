import axios from 'axios';
import config from 'config';

import { EntraClaims } from './Entra';
import { normalise } from './Profiles';

const NAME_MAX_LENGTH = 200;

export interface EntraUser {
  id: number;
  userReference: string;
  entraObjectId: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  lastLoginAt: string;
}

/** POST /session: upserts the signed-in user in the backend; rejects if it cannot be reached or refuses. */
export async function saveEntraUser(claims: EntraClaims): Promise<EntraUser> {
  const backendUrl = process.env.API_URL || config.get<string>('backend.url');

  try {
    const response = await axios.post<EntraUser>(
      `${backendUrl}/session`,
      {
        objectId: claims.oid,
        email: normalise(claims.email ?? ''),
        name: (claims.name ?? '').trim().slice(0, NAME_MAX_LENGTH),
      },
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    throw new Error(
      status
        ? `the backend refused to save the user: ${status}`
        : `could not reach the backend: ${(error as Error).message}`,
      { cause: error }
    );
  }
}
