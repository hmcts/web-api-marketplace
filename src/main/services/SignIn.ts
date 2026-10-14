/** The signed-in developer, as the session holds them. */
export interface SignedInUser {
  /** The backend's own user id, which every request it stores is attributed to. */
  id: number;
  /** The user's Entra object id: the stable key for everything we hold about them. */
  oid?: string;
  email: string;
  firstName: string;
  lastName: string;
  /**
   * Set for a user the backend does not know. Their submissions go to the data store,
   * since the backend would reject a user id it has never seen — see services/Profiles.
   */
  local?: boolean;
}
