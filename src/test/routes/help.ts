import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

const pages = ['/help', '/help/resources'];

describe('Help and support', () => {
  test.each(pages)('getting_%s_should_return_200', async (path: string) => {
    await request(app)
      .get(path)
      .expect(res => expect(res.status).to.equal(200));
  });
});
