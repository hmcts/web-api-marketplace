jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));

// Submitting reaches the backend, which these tests must not depend on being up.
jest.mock('../../main/services/PublicationRequest', () => ({
  ...jest.requireActual('../../main/services/PublicationRequest'),
  submitPublicationRequest: jest.fn().mockResolvedValue({
    ok: true,
    reference: 'b2c3d4e5-0000-4000-8000-000000000002',
  }),
}));

import { describeFormJourney } from './helpers/formJourney';

const completeAnswers = {
  'api-name': 'Court Schedule',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
};

describeFormJourney({
  name: 'Publish an API',
  path: '/publish',
  emptyFormError: 'Enter the name of your API',
  checkAnswersContains: ['Court Schedule'],
  confirmationContains: 'Submission received',
  referencePattern: /id="confirmation-reference">b2c3d4e5-/,
  answers: async () => completeAnswers,
});
