import { Server } from 'node:http';

import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../../main/app';

import { claimsFor, signInThroughEntra } from './entra';

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

export type Agent = ReturnType<typeof request.agent>;

/** Signs in through Entra as this address for the first time, and gets through the welcome. */
export async function signedInConsumer(email: string): Promise<Agent> {
  const agent = newAgent();

  await signInThroughEntra(agent, claimsFor(email)).then(res =>
    expect(res.headers.location, 'a first sign in should go to the welcome').to.equal('/account/welcome')
  );
  await agent
    .post('/account/welcome')
    .type('form')
    .send({ organisation: 'Analytical Engines Ltd', role: 'consumer', agree: 'yes' })
    .expect(302);
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
