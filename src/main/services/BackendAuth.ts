/**
 * Both identities a backend call carries: the header the service has always read, and the token
 * it can verify for itself. Sessions started before the token was kept carry only the header.
 */
export function authHeaders(requestingUserId: string, token?: string): Record<string, string> {
  return token ? { requestingUserId, Authorization: `Bearer ${token}` } : { requestingUserId };
}
