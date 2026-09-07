jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));

// Submitting reaches the backend, which these tests must not depend on being up.
jest.mock('../../main/services/AccessRequest', () => ({
  ...jest.requireActual('../../main/services/AccessRequest'),
  submitAccessRequest: jest.fn().mockResolvedValue({ ok: true, reference: 'e6a1c0de-0000-4000-8000-000000000001' }),
}));

import { expect } from 'chai';

import { DECLARATIONS } from '../../main/services/AccessRequest';
import { getCatalogueApis } from '../../main/services/ApiCatalogue';

import { describeFormJourney, signedInAgent } from './helpers/formJourney';

/** A complete, valid set of answers. The API list comes from the live catalogue. */
const answersFor = async () => ({
  'api-name': (await getCatalogueApis())[0].name,
  'call-volume': 'low',
  'use-case': 'Ingesting documents for the case bundle service.',
  declarations: DECLARATIONS.map(declaration => declaration.value),
});

describeFormJourney({
  name: 'Subscribe to an API',
  path: '/subscribe',
  emptyFormError: 'Select the API you need access to',
  checkAnswersContains: ['Low'],
  confirmationContains: 'Request submitted',
  referencePattern: /id="confirmation-reference">e6a1c0de-/,
  answers: answersFor,
});

describe('Questions dropped from the subscribe form', () => {
  test('the_form_should_not_ask_for_an_environment_or_oauth_capability', async () => {
    const agent = await signedInAgent();

    await agent.get('/subscribe').expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text, 'no environment field').to.not.contain('name="environment"');
      expect(res.text, 'no oauth field').to.not.contain('name="oauth"');
      expect(res.text).to.not.contain('Can your system implement OAuth 2.0');
      // The remaining questions are untouched.
      expect(res.text).to.contain('name="call-volume"');
      expect(res.text).to.contain('name="use-case"');
    });
  });

  test('the_declaration_should_no_longer_promise_an_answer_the_form_cannot_take', async () => {
    const agent = await signedInAgent();

    await agent.get('/subscribe').expect(res => {
      // The OAuth declaration used to end "or I have said I need guidance", which pointed
      // at the question that has gone.
      expect(res.text).to.not.contain('or I have said I need guidance');
      expect(res.text).to.contain('My system can implement OAuth 2.0 with JWT bearer tokens');
    });
  });

  test('an_environment_posted_by_hand_should_not_come_back_as_a_hidden_field', async () => {
    const agent = await signedInAgent();
    const body = { ...(await answersFor()), environment: 'production', oauth: 'yes' };

    await agent
      .post('/subscribe')
      .type('form')
      .send(body)
      .expect(res => {
        expect(res.status).to.equal(200);
        // Check-answers echoes the answers on as hidden fields. Anything it echoes gets
        // submitted, so a field the form no longer asks for must not survive the hop.
        expect(res.text).to.not.contain('name="environment"');
        expect(res.text).to.not.contain('name="oauth"');
      });
  });
});
