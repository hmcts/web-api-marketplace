import express from 'express';
import request from 'supertest';

import { Helmet } from '../../../main/modules/helmet';
import { withCleanEnv } from '../helpers/env';

const ENTRA_SETTINGS = ['ENTRA_TENANT_ID', 'ENTRA_AUTHORIZE_ENDPOINT'];

async function formAction(): Promise<string | undefined> {
  const app = express();
  new Helmet({}, false).enableFor(app);
  app.get('/', (_req, res) => {
    res.send('ok');
  });

  const response = await request(app).get('/');
  return response.headers['content-security-policy']
    .split(';')
    .find((directive: string) => directive.startsWith('form-action'));
}

describe('Helmet', () => {
  withCleanEnv(ENTRA_SETTINGS);

  test('without_sign_in_forms_should_post_only_to_this_service', async () => {
    expect(await formAction()).toBe("form-action 'self'");
  });

  test('with_sign_in_forms_should_also_post_to_entra', async () => {
    process.env.ENTRA_AUTHORIZE_ENDPOINT = 'https://login.example/tenant/oauth2/v2.0/authorize';

    expect(await formAction()).toBe("form-action 'self' https://login.example");
  });
});
