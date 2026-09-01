import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

describe('Documentation page', () => {
  test('getting_the_documentation_page_should_return_200', async () => {
    await request(app)
      .get('/documentation')
      .expect(res => expect(res.status).to.equal(200));
  });
});
