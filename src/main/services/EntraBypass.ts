import { EntraClaims } from './Entra';

const JOHN_DOE: EntraClaims = {
  oid: '00000000-0000-4000-8000-00000000d0e0',
  email: 'john.doe@example.com',
  name: 'John Doe',
};

/** Signs in as a fixed user without Entra. Needs BYPASS_ENTRA=true and development. */
export const entraBypass = {
  get enabled(): boolean {
    return askedFor() && inDevelopment();
  },

  get refused(): boolean {
    return askedFor() && !inDevelopment();
  },

  get claims(): EntraClaims {
    return JOHN_DOE;
  },
};

function askedFor(): boolean {
  return process.env.BYPASS_ENTRA === 'true';
}

// Explicitly, not by default: nothing deployed sets NODE_ENV, so a default of development
// would leave the bypass one variable away from working in a cluster. `yarn start:dev` sets it.
function inDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}
