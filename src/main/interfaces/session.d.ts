import { ApplicationDraft } from '../services/Applications';
import { Email } from '../services/Notify';
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
    /** Where to go after signing in, when sign-in interrupted the way there. */
    returnTo?: string;
    /** The last email "sent", for the page that follows to preview — see services/Notify. */
    outbox?: Email;
    /** The address a "check your email" page is about, whether or not anything was sent. */
    emailSentTo?: string;
    /** A one-off banner for the next page rendered, then cleared. */
    notice?: { success: boolean; title: string; text: string };
    /** Answers collected so far by the multi-page journeys, until they are submitted. */
    applicationDraft?: ApplicationDraft;
    productionDraft?: Record<string, string | string[]>;
    newApiDraft?: Record<string, string | string[]>;
  }
}
