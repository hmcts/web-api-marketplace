import { SignedInUser } from '../services/SignIn';

declare module 'express-session' {
  interface SessionData {
    user?: SignedInUser;
    /**
     * The outcome of the last delete, shown once on the account page and then cleared.
     *
     * Held in the session rather than passed as a query parameter so that refreshing the
     * page does not keep re-announcing something that already happened, and so nothing
     * about a user's requests appears in a URL.
     */
    requestNotice?: 'deleted' | 'deleteFailed';
  }
}
