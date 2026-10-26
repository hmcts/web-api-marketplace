import { ApplicationDraft } from '../services/Applications';
import { Email } from '../services/Notify';
import { SignedInUser } from '../services/SignIn';

declare module 'express-session' {
  interface SessionData {
    user?: SignedInUser;
    /** Where to go after signing in, when sign-in interrupted the way there. */
    returnTo?: string;
    /**
     * The sign in this browser started and has not yet come back from Entra. `state`
     * proves the callback belongs to it (the CSRF check); `nonce` is what Entra must
     * copy into the ID token, so a token from another sign in cannot be replayed here.
     * `codeVerifier` is the PKCE verifier for the code exchange.
     */
    entraSignIn?: { state: string; nonce: string; codeVerifier: string };
    /** The last email "sent", for the page that follows to preview — see services/Notify. */
    outbox?: Email;
    /** A one-off banner for the next page rendered, then cleared. */
    notice?: { success: boolean; title: string; text: string };
    /** Answers collected so far by the multi-page journeys, until they are submitted. */
    applicationDraft?: ApplicationDraft;
    productionDraft?: Record<string, string | string[]>;
    newApiDraft?: Record<string, string | string[]>;
  }
}
