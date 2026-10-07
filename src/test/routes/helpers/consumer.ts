import { Server } from 'node:http';

import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../../main/app';

let server: Server | undefined;

/**
 * One listening server for the whole test file. Handing supertest the app instead starts
 * a new server on a new port for every request, and with several test files running at
 * once that churn occasionally sends a request to a port that has just been closed and
 * reused — the journeys here make hundreds of requests, so it showed up as rare, random
 * failures.
 */
export function testServer(): Server {
  server ??= app.listen(0);
  return server;
}

afterAll(
  () =>
    new Promise<void>(resolve => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    })
);

/** A browser: a cookie jar against the shared test server. */
export function newAgent(): ReturnType<typeof request.agent> {
  return request.agent(testServer());
}

export const CATALOGUE = [
  {
    name: 'api-cp-crime-hearing',
    title: 'CP Crime Hearing API',
    description: 'Hearing lifecycle data.',
    team: 'api-marketplace',
  },
  { name: 'api-cp-crime-defendant-details', title: 'Defendant Details', description: 'Defendant details for a case.' },
];

export const PASSWORD = 'correct horse battery';

export type Agent = ReturnType<typeof request.agent>;

/** The link in the email preview shown on the page after an email is "sent". */
export function emailLink(html: string): string {
  const href = /href="([^"]+)" id="email-preview-link"/.exec(html)?.[1];
  expect(href, 'the page should preview the email with its link').to.be.a('string');
  return (href as string).replaceAll('&amp;', '&');
}

/** Registers and confirms an account through the real journey, returning a fresh agent. */
export async function registeredAccount(email: string): Promise<Agent> {
  const agent = newAgent();

  await agent
    .post('/register')
    .type('form')
    .send({
      'first-name': 'Ada',
      'last-name': 'Lovelace',
      email,
      organisation: 'Analytical Engines Ltd',
      role: 'consumer',
      password: PASSWORD,
      'password-confirm': PASSWORD,
    })
    .expect(302);

  const checkEmail = await agent.get('/register/check-email').expect(200);
  await agent.get(emailLink(checkEmail.text)).expect(200);
  return agent;
}

/** Registers, confirms, signs in and gets through the welcome page. */
export async function signedInConsumer(email: string): Promise<Agent> {
  const agent = await registeredAccount(email);

  await agent.post('/sign-in').type('form').send({ email, password: PASSWORD }).expect(302);
  await agent.post('/account/welcome').type('form').send({ agree: 'yes' }).expect(302);
  return agent;
}

/** Creates an application through the real journey and returns its id. */
export async function createdApplication(agent: Agent, name = 'Case tracker'): Promise<string> {
  await agent.post('/account/applications/new/details').type('form').send({ name }).expect(302);
  await agent.post('/account/applications/new/apis').type('form').send({ apis: CATALOGUE[0].name }).expect(302);
  const created = await agent.post('/account/applications/new/check-answers').expect(200);

  const id = created.text.match(/href="\/account\/applications\/([0-9a-f-]{36})"/)?.[1];
  expect(id, 'the confirmation should link to the new application').to.be.a('string');
  return id as string;
}
