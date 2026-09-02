import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';
import { DECLARATIONS } from '../../main/services/AccessRequest';
import { getCatalogueApis } from '../../main/services/ApiCatalogue';

async function completeAnswers(): Promise<Record<string, string | string[]>> {
  const apis = await getCatalogueApis();

  return {
    'full-name': 'Joe Bloggs',
    organisation: 'HMCTS DTS',
    email: 'joe.bloggs@justice.gov.uk',
    'job-title': 'Senior Developer',
    phone: '',
    'api-name': apis[0].name,
    environment: 'sandbox',
    'call-volume': 'low',
    'use-case': 'Ingesting documents for the case bundle service.',
    oauth: 'yes',
    declarations: DECLARATIONS.map(declaration => declaration.value),
  };
}

describe('Subscribe to an API', () => {
  test('getting_the_form_should_return_200', async () => {
    await request(app)
      .get('/subscribe')
      .expect(res => expect(res.status).to.equal(200));
  });

  test('posting_an_empty_form_should_return_400_with_an_error_summary', async () => {
    await request(app)
      .post('/subscribe')
      .send({})
      .expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('There is a problem');
        expect(res.text).to.contain('Enter your full name');
      });
  });

  test('opening_check_answers_directly_should_redirect_to_the_form', async () => {
    await request(app)
      .get('/subscribe/check-answers')
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/subscribe');
      });
  });

  test('posting_valid_answers_should_render_the_check_answers_page', async () => {
    await request(app)
      .post('/subscribe')
      .send(await completeAnswers())
      .expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.contain('Check your answers before submitting');
        expect(res.text).to.contain('Sandbox (development and testing)');
      });
  });

  test('submitting_the_checked_answers_should_render_the_confirmation', async () => {
    await request(app)
      .post('/subscribe/check-answers')
      .send(await completeAnswers())
      .expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.contain('Request submitted');
        expect(res.text).to.match(/id="confirmation-reference">AMP-/);
      });
  });
});
