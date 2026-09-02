import { DECLARATIONS } from '../../main/services/AccessRequest';
import { getCatalogueApis } from '../../main/services/ApiCatalogue';

import { describeFormJourney } from './helpers/formJourney';

describeFormJourney({
  name: 'Subscribe to an API',
  path: '/subscribe',
  emptyFormError: 'Enter your full name',
  checkAnswersContains: ['Sandbox (development and testing)'],
  confirmationContains: 'Request submitted',
  // The API list comes from the live catalogue, so the answer has to be built from it.
  answers: async () => ({
    'full-name': 'Joe Bloggs',
    organisation: 'HMCTS DTS',
    email: 'joe.bloggs@justice.gov.uk',
    'job-title': 'Senior Developer',
    phone: '',
    'api-name': (await getCatalogueApis())[0].name,
    environment: 'sandbox',
    'call-volume': 'low',
    'use-case': 'Ingesting documents for the case bundle service.',
    oauth: 'yes',
    declarations: DECLARATIONS.map(declaration => declaration.value),
  }),
});
