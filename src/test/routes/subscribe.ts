jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));

// Submitting reaches the backend, which these tests must not depend on being up.
jest.mock('../../main/services/AccessRequest', () => ({
  ...jest.requireActual('../../main/services/AccessRequest'),
  submitAccessRequest: jest.fn().mockResolvedValue({ ok: true, reference: 'e6a1c0de-0000-4000-8000-000000000001' }),
}));

import { DECLARATIONS } from '../../main/services/AccessRequest';
import { getCatalogueApis } from '../../main/services/ApiCatalogue';

import { describeFormJourney } from './helpers/formJourney';

describeFormJourney({
  name: 'Subscribe to an API',
  path: '/subscribe',
  emptyFormError: 'Select the API you need access to',
  checkAnswersContains: ['Sandbox (development and testing)'],
  confirmationContains: 'Request submitted',
  referencePattern: /id="confirmation-reference">e6a1c0de-/,
  // The API list comes from the live catalogue, so the answer has to be built from it.
  answers: async () => ({
    'api-name': (await getCatalogueApis())[0].name,
    environment: 'sandbox',
    'call-volume': 'low',
    'use-case': 'Ingesting documents for the case bundle service.',
    oauth: 'yes',
    declarations: DECLARATIONS.map(declaration => declaration.value),
  }),
});
