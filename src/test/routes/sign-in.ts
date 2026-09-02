import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

describe('Sign in page', () => {
  test('getting_the_sign_in_page_should_return_200', async () => {
    await request(app)
      .get('/sign-in')
      .expect(res => expect(res.status).to.equal(200));
  });

  test('posting_without_credentials_should_return_400', async () => {
    await request(app)
      .post('/sign-in')
      .type('form')
      .send({ email: '', password: '' })
      .expect(res => expect(res.status).to.equal(400));
  });
});
