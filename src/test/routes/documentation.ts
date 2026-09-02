import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

const pages = [
  '/documentation',
  '/documentation/architecture',
  '/documentation/architecture-principles',
  '/documentation/case-studies',
  '/documentation/our-api-technologies',
  '/documentation/our-capabilities',
];

describe('Documentation pages', () => {
  test.each(pages)('getting_%s_should_return_200', async (path: string) => {
    await request(app)
      .get(path)
      .expect(res => expect(res.status).to.equal(200));
  });

  test('every_page_the_documentation_index_links_to_should_exist', async () => {
    const index = await request(app).get('/documentation');
    const links = [...index.text.matchAll(/href="(\/documentation\/[a-z-]+)"/g)].map(match => match[1]);

    expect(links).to.have.length.greaterThan(0);

    for (const link of new Set(links)) {
      const page = await request(app).get(link);
      expect(page.status, `${link} should not be a dead link`).to.equal(200);
    }
  });
});
