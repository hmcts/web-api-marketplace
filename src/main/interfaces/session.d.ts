import { SignedInUser } from '../services/SignIn';

declare module 'express-session' {
  interface SessionData {
    user?: SignedInUser;
  }
}
