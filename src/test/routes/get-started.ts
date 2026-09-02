import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

const pages = [
  '/get-started',
  '/get-started/building-software',
  '/get-started/consumer-guidance',
  '/get-started/glossary',
  '/get-started/onboarding-guide',
  '/get-started/technology-introduction',
];

describe('Get started pages', () => {
  test.each(pages)('getting_%s_should_return_200', async (path: string) => {
    await request(app)
      .get(path)
      .expect(res => expect(res.status).to.equal(200));
  });
});
