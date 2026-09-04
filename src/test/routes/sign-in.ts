import axios from 'axios';
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

  test('an_unreachable_backend_should_report_a_service_error_rather_than_a_failed_login', async () => {
    // The whole point of the change: with the backend down the user used to be told
    // their email or password was wrong, and would go and try to fix credentials that
    // were never the problem.
    const post = jest.spyOn(axios, 'post').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8080'));

    try {
      await request(app)
        .post('/sign-in')
        .type('form')
        .send({ email: 'joe@example.com', password: 'any' })
        .expect(res => {
          expect(res.status).to.equal(503);
          expect(res.text).to.contain('Sign in is not available at the moment');
          expect(res.text).to.not.contain('Incorrect email or password');
          expect(res.text).to.not.contain('href="#email"');
          // Still filled in, so retrying is one click and one password.
          expect(res.text).to.contain('joe@example.com');
        });
    } finally {
      post.mockRestore();
    }
  });

  test('a_backend_error_should_report_a_service_error_too', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 503, data: '' });

    try {
      await request(app)
        .post('/sign-in')
        .type('form')
        .send({ email: 'joe@example.com', password: 'any' })
        .expect(res => {
          expect(res.status).to.equal(503);
          expect(res.text).to.contain('Sign in is not available at the moment');
        });
    } finally {
      post.mockRestore();
    }
  });

  test('a_rejected_sign_in_should_still_say_the_credentials_are_wrong', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 404, data: { error: 'User not found.' } });

    try {
      await request(app)
        .post('/sign-in')
        .type('form')
        .send({ email: 'nobody@example.com', password: 'any' })
        .expect(res => {
          expect(res.status).to.equal(401);
          expect(res.text).to.contain('Incorrect email or password');
          expect(res.text).to.not.contain('Sign in is not available');
        });
    } finally {
      post.mockRestore();
    }
  });
});
