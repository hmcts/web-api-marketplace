import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

describe('Cookies page', () => {
  describe('on GET', () => {
    test('the_cookies_page_should_answer_200_and_mention_cookies', async () => {
      await request(app)
        .get('/cookies')
        .expect(res => {
          expect(res.status).to.equal(200);
          expect(res.text).to.contain('Cookies');
        });
    });
  });
});
