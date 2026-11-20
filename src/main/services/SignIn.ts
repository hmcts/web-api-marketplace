/** The signed-in developer, as the session holds them. */
export interface SignedInUser {
  /** The backend's own user id, which every request it stores is attributed to. */
  id: number;
  /** The backend's reference for them, such as user001, which their APIM names start with. */
  userReference?: string;
  /** The user's Entra object id: the stable key for everything we hold about them. */
  oid?: string;
  email: string;
  name: string;
  role?: string;
  /** Set while the backend has no requests: submissions go to the data store. */
  local?: boolean;
  /** App roles read out of the verified ID token. Nothing here is held in this service. */
  roles?: string[];
}

export function isAdmin(user?: SignedInUser): boolean {
  return user?.role === 'ADMIN';
}
