import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

// TODO: replace this sample test with proper route tests for your application

describe('Home page', () => {
  describe('on GET', () => {
    test('should return sample home page', async () => {
      await request(app)
        .get('/')
        .expect(res => expect(res.status).to.equal(200));
    });
  });

  describe('in English only', () => {
    test('asking_for_welsh_should_still_get_english', async () => {
      await request(app)
        .get('/?lng=cy')
        .expect(res => expect(res.text).to.contain('<html lang="en"'));
    });

    test('no_language_cookie_should_be_set', async () => {
      await request(app)
        .get('/?lng=cy')
        .expect(res => {
          const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
          expect(cookies.some(cookie => cookie.startsWith('i18next='))).to.equal(false);
        });
    });
  });
});
