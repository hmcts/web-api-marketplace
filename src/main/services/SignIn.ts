export interface SignedInUser {
  /** The backend's own user id, which every request it stores is attributed to. */
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
  /** A user the backend does not know: their submissions go to the data store instead. */
  local?: boolean;
  role?: 'consumer' | 'producer';
}
