import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';
import { PUBLISH_DECLARATIONS } from '../../main/services/PublicationRequest';

const pages = ['/publish'];

const completeAnswers = {
  'api-name': 'Court Schedule',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
  classification: 'official',
  declarations: PUBLISH_DECLARATIONS.map(declaration => declaration.value),
};

describe('Publish an API', () => {
  test.each(pages)('getting_%s_should_return_200', async (path: string) => {
    await request(app)
      .get(path)
      .expect(res => expect(res.status).to.equal(200));
  });

  test('posting_an_empty_form_should_return_400_with_an_error_summary', async () => {
    await request(app)
      .post('/publish')
      .send({})
      .expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('There is a problem');
        expect(res.text).to.contain('Enter the name of your API');
      });
  });

  test('posting_a_secret_classification_should_be_refused_with_the_reason', async () => {
    await request(app)
      .post('/publish')
      .send({ ...completeAnswers, classification: 'secret' })
      .expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('cannot be listed in the marketplace');
      });
  });

  test('posting_valid_answers_should_render_the_check_answers_page', async () => {
    await request(app)
      .post('/publish')
      .send(completeAnswers)
      .expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.contain('Check your answers before submitting');
        expect(res.text).to.contain('Court Schedule');
        expect(res.text).to.contain('All 3 confirmed');
      });
  });

  test('submitting_the_checked_answers_should_render_the_confirmation', async () => {
    await request(app)
      .post('/publish/check-answers')
      .send(completeAnswers)
      .expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.contain('Submission received');
        expect(res.text).to.match(/id="confirmation-reference">AMP-/);
      });
  });

  test('opening_check_answers_directly_should_redirect_to_the_form', async () => {
    await request(app)
      .get('/publish/check-answers')
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/publish');
      });
  });
});
