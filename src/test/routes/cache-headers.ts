import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';

// The Cache-Control middleware used to be registered after the controllers, so it never
// applied to a rendered page or a JSON response — leaving them cacheable by browsers and
// by Front Door. These assert it reaches real responses, not just 404s.
describe('Cache headers', () => {
  const noStore = /no-store/;

  test('a_rendered_page_should_not_be_cacheable', async () => {
    const res = await request(app).get('/');

    expect(res.status).to.equal(200);
    expect(res.headers['cache-control']).to.match(noStore);
  });

  test('a_json_endpoint_should_not_be_cacheable', async () => {
    const res = await request(app).get('/backend-check');

    expect(res.headers['cache-control']).to.match(noStore);
  });

  test('a_not_found_page_should_not_be_cacheable', async () => {
    const res = await request(app).get('/no-such-page');

    expect(res.status).to.equal(404);
    expect(res.headers['cache-control']).to.match(noStore);
  });
});
