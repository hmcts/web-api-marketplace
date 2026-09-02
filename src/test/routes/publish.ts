import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';
import { PUBLISH_DECLARATIONS } from '../../main/services/PublicationRequest';

import { describeFormJourney } from './helpers/formJourney';

const completeAnswers = {
  'api-name': 'Court Schedule',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
  classification: 'official',
  declarations: PUBLISH_DECLARATIONS.map(declaration => declaration.value),
};

describeFormJourney({
  name: 'Publish an API',
  path: '/publish',
  emptyFormError: 'Enter the name of your API',
  checkAnswersContains: ['Court Schedule', 'All 3 confirmed'],
  confirmationContains: 'Submission received',
  answers: async () => completeAnswers,
});

describe('Publish an API, eligibility', () => {
  test('posting_a_secret_classification_should_be_refused_with_the_reason', async () => {
    await request(app)
      .post('/publish')
      .send({ ...completeAnswers, classification: 'secret' })
      .expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('cannot be listed in the marketplace');
      });
  });
});
