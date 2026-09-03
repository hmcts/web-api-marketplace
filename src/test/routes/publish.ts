jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));

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
  answers: async () => completeAnswers,
});
