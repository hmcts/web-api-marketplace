import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../../main/app';

import { claimsFor, signInThroughEntra } from './entra';

/**
 * A supertest agent carrying a session, because both journeys require one. Signed in
 * through the stub Entra tenant rather than by forging a cookie, so
 * these tests exercise the same session the guard reads.
 */
export async function signedInAgent(): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);

  await signInThroughEntra(agent, claimsFor('joe.bloggs@justice.gov.uk', 'Joe Bloggs'));
  return agent;
}

export interface FormJourney {
  /** What the describe block is called. */
  name: string;
  /** The journey's base path, e.g. '/subscribe'. Check answers hangs off it. */
  path: string;
  /** A complete, valid set of answers. Async because some are built from live data. */
  answers: () => Promise<Record<string, unknown>>;
  /** An error the empty form must report, proving validation ran server-side. */
  emptyFormError: string;
  /** Strings the check-answers page must show, proving answers survive the hop. */
  checkAnswersContains: string[];
  /** The confirmation page's heading. */
  confirmationContains: string;
  /** The shape of the reference shown. Journeys wired to the backend quote its id. */
  referencePattern?: RegExp;
}

/**
 * The shape every form journey in this service shares: a form, a check-answers page the
 * answers are posted on to, and a confirmation carrying a reference.
 *
 * Written once rather than per journey because the two are structurally identical, and a
 * third gets the same coverage by describing itself rather than by copying a file. The
 * journey-specific cases live alongside the call, not in here.
 */
export function describeFormJourney(journey: FormJourney): void {
  describe(journey.name, () => {
    test('getting_the_form_should_return_200', async () => {
      await (await signedInAgent()).get(journey.path).expect(res => expect(res.status).to.equal(200));
    });

    test('posting_an_empty_form_should_return_400_with_an_error_summary', async () => {
      await (
        await signedInAgent()
      )
        .post(journey.path)
        .send({})
        .expect(res => {
          expect(res.status).to.equal(400);
          expect(res.text).to.contain('There is a problem');
          expect(res.text).to.contain(journey.emptyFormError);
        });
    });

    test('posting_valid_answers_should_render_the_check_answers_page', async () => {
      await (
        await signedInAgent()
      )
        .post(journey.path)
        .send(await journey.answers())
        .expect(res => {
          expect(res.status).to.equal(200);
          expect(res.text).to.contain('Check your answers before submitting');
          for (const expected of journey.checkAnswersContains) {
            expect(res.text, `check answers should show ${expected}`).to.contain(expected);
          }
        });
    });

    test('submitting_the_checked_answers_should_render_the_confirmation', async () => {
      await (
        await signedInAgent()
      )
        .post(`${journey.path}/check-answers`)
        .send(await journey.answers())
        .expect(res => {
          expect(res.status).to.equal(200);
          expect(res.text).to.contain(journey.confirmationContains);
          expect(res.text).to.match(journey.referencePattern ?? /id="confirmation-reference">AMP-/);
        });
    });

    test('opening_check_answers_directly_should_redirect_to_the_form', async () => {
      await (await signedInAgent()).get(`${journey.path}/check-answers`).expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal(journey.path);
      });
    });
  });
}
