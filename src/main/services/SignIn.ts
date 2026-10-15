/** The signed-in developer, as the session holds them. */
export interface SignedInUser {
  /** The backend's own user id, which every request it stores is attributed to. */
  id: number;
  /** The user's Entra object id: the stable key for everything we hold about them. */
  oid?: string;
  email: string;
  name: string;
  /** Set while the backend has no requests: submissions go to the data store. */
  local?: boolean;
}
