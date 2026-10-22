import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/ApiSpecs', () => ({
  ...jest.requireActual('../../main/services/ApiSpecs'),
  getSpecDescription: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
}));

import { MemoryStore, useDataStore } from '../../main/modules/store';
import { STUB_TENANT_ID } from '../stubs/marketplace';

import { CATALOGUE, createdApplication, newAgent, signedInConsumer, testServer } from './helpers/consumer';
import { claimsFor, signInThroughEntra, stubEntra } from './helpers/entra';

const { getCatalogueApis } = require('../../main/services/ApiCatalogue');

const SLC = { name: 'api-cp-crime-schedulingandlisting-courtschedule', title: 'Scheduling and Listing Court Schedule' };

/**
 * The consumer onboarding journey end to end, through the real app: create an account,
 * confirm the address, sign in, create an application, manage its
 * APIs and credentials, ask for production credentials, and tidy up.
 */
describe('Consumer onboarding journey', () => {
  beforeEach(() => {
    useDataStore(new MemoryStore());
    (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE);
  });

  describe('creating an account', () => {
    test('create_a_developer_account_should_open_entra_on_its_create_account_form', async () => {
      const agent = newAgent();

      await agent.get('/register').expect(res => expect(res.headers.location).to.equal('/sign-in?prompt=create'));
      await agent.get('/sign-in?prompt=create').expect(res => {
        const sentTo = new URL(res.headers.location);
        expect(sentTo.origin + sentTo.pathname).to.equal(stubEntra().authorizeEndpoint);
        expect(sentTo.searchParams.get('prompt')).to.equal('create');
      });
    });

    test('forgotten_your_password_should_go_to_sign_in_where_entra_offers_the_reset', async () => {
      await request(testServer())
        .get('/forgotten-password')
        .expect(res => expect(res.headers.location).to.equal('/sign-in'));
    });

    test('a_signed_in_user_asking_to_create_an_account_should_go_to_their_account', async () => {
      const agent = await signedInConsumer('ada@example.com');

      await agent.get('/register').expect(res => expect(res.headers.location).to.equal('/account'));
    });
  });

  describe('signing in', () => {
    test('the_first_sign_in_should_land_on_the_account_page', async () => {
      const agent = newAgent();

      await signInThroughEntra(agent, claimsFor('ada@example.com')).then(res =>
        expect(res.headers.location).to.equal('/account')
      );

      await agent.get('/account').expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.contain('ada@example.com');
        expect(res.text).to.not.contain('Organisation');
      });
    });

    test('later_sign_ins_should_land_on_the_account_page_too', async () => {
      const agent = await signedInConsumer('ada@example.com');
      await agent.post('/sign-out').expect(302);

      await signInThroughEntra(agent, claimsFor('ada@example.com')).then(res =>
        expect(res.headers.location).to.equal('/account')
      );
    });

    test('a_sign_in_asked_for_by_another_page_should_still_land_on_the_account_page', async () => {
      const agent = await signedInConsumer('ada@example.com');
      await agent.post('/sign-out');

      await agent
        .get('/account/production-credentials')
        .expect(res => expect(res.headers.location).to.equal('/sign-in'));
      await signInThroughEntra(agent, claimsFor('ada@example.com')).then(res =>
        expect(res.headers.location).to.equal('/account')
      );
    });

    test('cancelling_on_entra_should_leave_the_visitor_signed_out_and_say_so', async () => {
      const agent = newAgent();
      const started = await agent.get('/sign-in').expect(302);
      const state = new URL(started.headers.location).searchParams.get('state');

      await agent.get(`/auth/callback?error=access_denied&state=${state}`).expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('There is a problem signing you in');
        expect(res.text).to.contain('href="/sign-in"');
      });
      await agent.get('/account').expect(res => expect(res.headers.location).to.equal('/sign-in'));
    });
  });

  describe('applications', () => {
    afterEach(() => stubEntra().reset());

    test('creating_an_application_should_show_the_secret_once_and_mask_it_afterwards', async () => {
      const agent = await signedInConsumer('ada@example.com');

      await agent
        .get('/account/applications')
        .expect(res => expect(res.text).to.contain('You have no applications yet'));
      await agent.get('/account/applications/new').expect(200);
      await agent
        .post('/account/applications/new/details')
        .type('form')
        .send({})
        .expect(res => {
          expect(res.status).to.equal(400);
          expect(res.text).to.contain('Enter an application name');
        });
      for (const name of ['Reports', 'Case-tracker']) {
        await agent
          .post('/account/applications/new/details')
          .type('form')
          .send({ name })
          .expect(res => expect(res.text).to.contain('Application name must be 8 to 50 letters, numbers or spaces'));
      }
      await agent.post('/account/applications/new/details').type('form').send({ name: 'Case tracker' });
      await agent
        .post('/account/applications/new/apis')
        .type('form')
        .send({})
        .expect(res => expect(res.text).to.contain('Select at least one API'));
      await agent
        .post('/account/applications/new/apis')
        .type('form')
        .send({ apis: [CATALOGUE[0].name, CATALOGUE[1].name] });

      await agent.get('/account/applications/new/check-answers').expect(res => {
        expect(res.text).to.contain('Case tracker');
        expect(res.text).to.contain('CP Crime Hearing API, Defendant Details');
      });

      const created = await agent.post('/account/applications/new/check-answers').expect(200);
      const secret = /id="client-secret"[^>]*>([^<]+)</.exec(created.text)?.[1] as string;
      const id = /href="\/account\/applications\/([0-9a-f-]{36})"/.exec(created.text)?.[1] as string;

      expect(created.text).to.contain('Application created');
      expect(created.text).to.contain('id="publisher-id">33333333-3333-3333-3333-333333333333<');
      expect(created.text).to.contain('You will not be able to see it again');
      expect(secret).to.match(/^.{3}8Q~.{34}$/);
      expect(created.text.match(/Subscription key: <span class="apim-credential">[0-9a-f]{32}</g)).to.have.length(2);
      expect(created.text).to.contain('These credentials will not work yet');
      expect(created.text).to.contain(`data-access-url="/account/applications/${id}/access"`);

      const subscriptions = [...stubEntra().marketplace.subscriptions.entries()];
      expect(
        subscriptions.map(([name]) => name).every(name => /^amp-user\d{3}-[a-z0-9-]+-(hearing|defendant)$/.test(name))
      ).to.equal(true);
      expect(subscriptions.map(([, subscription]) => subscription.productId)).to.deep.equal([
        'cp-crime-hearing',
        'cp-crime-defendant-details',
      ]);

      await agent.get(`/account/applications/${id}`).expect(res => {
        expect(res.text).to.contain(`${secret.slice(0, 3)}****`);
        expect(res.text).to.not.contain(secret);
        // Neither API is SLC, so there are no instructions, Publisher ID included, to fold away.
        expect(res.text).to.not.contain('id="publisher-id"');
        expect(res.text).to.not.contain('id="api-instructions"');
      });

      await agent.post('/account/applications/new/check-answers').expect(302);
      await agent
        .get('/account/applications')
        .expect(res => expect(res.text.match(/>Case tracker</g)).to.have.length(1));
    });

    test('the_same_name_twice_should_be_refused_by_the_backend', async () => {
      const agent = await signedInConsumer('ada@example.com');
      await createdApplication(agent, 'Case tracker');

      await agent.post('/account/applications/new/details').type('form').send({ name: 'case tracker' }).expect(302);
      await agent.post('/account/applications/new/apis').type('form').send({ apis: CATALOGUE[0].name });
      await agent.post('/account/applications/new/check-answers').expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('You already have an application called case tracker');
      });
      expect(stubEntra().marketplace.applications.size).to.equal(1);
    });

    test('access_should_be_retried_until_entra_can_assign_the_role', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);
      stubEntra().marketplace.roleNotAssignableFor(1);

      const check = () => agent.post(`/account/applications/${id}/access`).set('Accept', 'application/json');
      await check().expect(res => expect(res.body).to.deep.equal({ state: 'pending' }));
      await check().expect(res => expect(res.body).to.deep.equal({ state: 'granted' }));

      expect(stubEntra().marketplace.applications.get(id)?.roles).to.deep.equal(['app.read']);
      await agent.get(`/account/applications/${id}`).expect(res => {
        expect(res.text).to.contain('id="access-granted"');
        expect(res.text).to.not.contain('These credentials will not work yet');
      });
    });

    test('access_that_graph_refuses_should_say_why_and_stop', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);
      stubEntra().marketplace.refuseRoles(500);

      await agent
        .post(`/account/applications/${id}/access`)
        .set('Accept', 'application/json')
        .expect(res => {
          expect(res.body.state).to.equal('failed');
          expect(res.body.message).to.contain('AppRoleAssignment.ReadWrite.All');
        });
    });

    test('checking_access_without_javascript_should_come_back_to_the_application_with_the_outcome', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

      await agent
        .post(`/account/applications/${id}/access`)
        .type('form')
        .expect(res => expect(res.headers.location).to.equal(`/account/applications/${id}`));
      await agent.get(`/account/applications/${id}`).expect(res => {
        expect(res.text).to.contain('Case tracker can now call the APIs it is subscribed to.');
      });
    });

    test('an_api_that_cannot_be_subscribed_should_not_lose_the_secret', async () => {
      const agent = await signedInConsumer('ada@example.com');
      stubEntra().marketplace.failSubscriptions(502);

      await agent.post('/account/applications/new/details').type('form').send({ name: 'Case tracker' });
      await agent.post('/account/applications/new/apis').type('form').send({ apis: CATALOGUE[0].name });
      await agent.post('/account/applications/new/check-answers').expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.match(/id="client-secret"[^>]*>.{3}8Q~/);
        expect(res.text).to.contain('These APIs could not be added just now: CP Crime Hearing API');
      });
    });

    test('the_instructions_should_fold_away_right_under_the_slc_row_and_no_other', async () => {
      (getCatalogueApis as jest.Mock).mockResolvedValue([...CATALOGUE, SLC]);
      const agent = await signedInConsumer('ada@example.com');
      await agent.post('/account/applications/new/details').type('form').send({ name: 'Court tracker' });
      await agent
        .post('/account/applications/new/apis')
        .type('form')
        .send({ apis: [CATALOGUE[0].name, SLC.name] });
      const created = await agent.post('/account/applications/new/check-answers').expect(200);
      const id = /href="\/account\/applications\/([0-9a-f-]{36})"/.exec(created.text)?.[1] as string;

      await agent.get(`/account/applications/${id}`).expect(res => {
        const rows = res.text.split('<tr class="govuk-table__row">').slice(2);
        const slcRow = rows.findIndex(row => row.includes(`>${SLC.title}<`));

        expect(res.text.match(/id="api-instructions"/g)).to.have.length(1);
        expect(rows[slcRow + 1]).to.match(/colspan="2"[\s\S]*id="api-instructions"/);
        expect(rows[slcRow + 1]).to.match(/<summary[\s\S]*?How to get an access token and call an API/);
        expect(rows[slcRow + 1]).to.contain(`https://login.microsoftonline.com/${STUB_TENANT_ID}/oauth2/v2.0/token`);
        expect(rows[slcRow + 1]).to.contain('scope=33333333-3333-3333-3333-333333333333/.default');
        // The Publisher ID is at the top of the panel, before the token request, and nowhere else.
        expect(rows[slcRow + 1]).to.match(
          /id="publisher-id">33333333-3333-3333-3333-333333333333<[\s\S]*id="token-request"/
        );
        expect(res.text.match(/id="publisher-id"/g)).to.have.length(1);
        expect(rows[slcRow + 1]).to.contain('client_secret=&lt;client_secret&gt;');
        expect(rows.filter(row => row.includes('id="api-instructions"'))).to.have.length(1);
      });
    });

    test('viewing_an_api_should_show_the_key_from_apim_but_not_the_publisher_id', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);
      const [subscription] = [...stubEntra().marketplace.subscriptions.values()];

      await agent.get(`/account/applications/${id}/apis/${CATALOGUE[0].name}`).expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.not.contain('Publisher ID');
        expect(res.text).to.contain(`id="subscription-key">${subscription.primaryKey}<`);
      });
      await agent.get(`/account/applications/${id}/apis/api-not-subscribed`).expect(404);
    });

    test('adding_and_removing_apis_should_say_what_changed', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);
      const [original] = [...stubEntra().marketplace.subscriptions.keys()];

      await agent
        .post(`/account/applications/${id}/apis`)
        .type('form')
        .send({ apis: CATALOGUE[1].name })
        .expect(res => expect(res.headers.location).to.equal(`/account/applications/${id}`));

      await agent.get(`/account/applications/${id}`).expect(res => {
        expect(res.text).to.contain('APIs updated: 1 added, 1 removed');
        expect(res.text).to.contain('Defendant Details');
        expect(res.text).to.not.contain('CP Crime Hearing API');
      });
      expect(stubEntra().marketplace.subscriptions.has(original), 'the removed key is revoked').to.equal(false);
      expect(stubEntra().marketplace.subscriptions.size).to.equal(1);
    });

    test('the_regenerate_secret_page_should_be_gone', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

      await agent.get(`/account/applications/${id}`).expect(res => expect(res.text).to.not.contain('Regenerate'));
      await agent.get(`/account/applications/${id}/client-secret`).expect(404);
    });

    test('deleting_should_remove_the_application_and_its_keys', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

      await agent.get(`/account/applications/${id}/delete`).expect(res => expect(res.text).to.contain('Are you sure'));
      await agent
        .post(`/account/applications/${id}/delete`)
        .type('form')
        .send({ confirm: 'yes' })
        .expect(res => expect(res.headers.location).to.equal('/account/applications'));

      await agent
        .get('/account/applications')
        .expect(res => expect(res.text).to.contain('Case tracker has been deleted'));
      await agent.get(`/account/applications/${id}`).expect(404);
      expect(stubEntra().marketplace.subscriptions.size).to.equal(0);
    });

    test('one_user_should_not_be_able_to_see_another_users_application', async () => {
      const owner = await signedInConsumer('ada@example.com');
      const id = await createdApplication(owner);
      const stranger = await signedInConsumer('charles@example.com');

      expect((await stranger.get(`/account/applications/${id}`)).status).to.equal(404);
      expect((await stranger.post(`/account/applications/${id}/access`).type('form')).status).to.equal(404);
      expect(
        (await stranger.post(`/account/applications/${id}/delete`).type('form').send({ confirm: 'yes' })).status
      ).to.equal(404);
      expect((await owner.get(`/account/applications/${id}`)).status, 'the owner still has it').to.equal(200);
    });

    test('a_user_the_backend_no_longer_knows_should_be_asked_to_sign_in_again', async () => {
      const agent = await signedInConsumer('ada@example.com');
      stubEntra().savedUsers.delete(claimsFor('ada@example.com').oid);

      await agent.get('/account/applications').expect(res => expect(res.headers.location).to.equal('/sign-in'));
      await agent.get('/account').expect(res => expect(res.headers.location).to.equal('/sign-in'));
    });
  });

  describe('production credentials', () => {
    test('a_user_with_no_applications_should_be_told_to_create_one', async () => {
      const agent = await signedInConsumer('ada@example.com');

      await agent.get('/account/production-credentials').expect(res => {
        expect(res.text).to.contain('You need an application that has been tested in the sandbox first');
        expect(res.text).to.contain('href="/account/applications/new"');
      });
    });

    test('submitting_a_request_should_give_a_reference_that_can_be_followed', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

      await agent.get(`/account/production-credentials?application=${id}`).expect(res => {
        expect(res.text).to.contain(`value="${id}" checked`);
        expect(res.text).to.contain('Organisation or team name');
        expect(res.text).to.contain('name="data-request"');
        expect(res.text).to.contain('name="proposed-outputs"');
        expect(res.text.split('for each API selected in the above application')).to.have.length(3);
        expect(res.text).to.not.contain('name="dpia"');
        expect(res.text).to.not.contain('name="declaration"');
        expect(res.text).to.not.contain('name="dsa"');
        expect(res.text).to.not.contain('name="security-contact"');
        expect(res.text).to.not.contain('name="use-case"');
      });
      await agent
        .post('/account/production-credentials')
        .type('form')
        .send({})
        .expect(res => {
          expect(res.status).to.equal(400);
          expect(res.text).to.contain('Select the application you need production credentials for');
          expect(res.text).to.contain('Describe the proposed outputs from this data use');
        });
      await agent
        .post('/account/production-credentials')
        .type('form')
        .send({
          application: id,
          organisation: 'Analytical Engines Ltd',
          'go-live-day': '1',
          'go-live-month': '4',
          'go-live-year': String(new Date().getFullYear() + 1),
          'call-volume': 'medium',
          'data-request': 'Hearing outcomes, used with court listings.',
          'proposed-outputs': 'A case summary shown inside our own service.',
        })
        .expect(res => expect(res.headers.location).to.equal('/account/production-credentials/check-answers'));

      await agent.get('/account/production-credentials/check-answers').expect(res => {
        expect(res.text).to.contain('Case tracker');
        expect(res.text).to.contain('1 April');
      });

      const confirmation = await agent.post('/account/production-credentials/check-answers').expect(200);
      const reference = /id="confirmation-reference">(PCR-[A-Z2-9]{8})</.exec(confirmation.text)?.[1] as string;
      expect(reference).to.be.a('string');

      await agent.get(`/account/production-credentials/${reference}`).expect(res => {
        expect(res.text).to.contain(reference);
        expect(res.text).to.contain('Submitted');
      });
      await agent.get('/account').expect(res => {
        expect(res.text).to.contain(`href="/account/production-credentials/${reference}"`);
        expect(res.text).to.contain('Production credentials');
      });

      const stranger = await signedInConsumer('charles@example.com');
      await stranger.get(`/account/production-credentials/${reference}`).expect(404);
    });

    test('a_go_live_date_in_the_past_should_be_refused', async () => {
      const agent = await signedInConsumer('ada@example.com');

      await agent
        .post('/account/production-credentials')
        .type('form')
        .send({ 'go-live-day': '31', 'go-live-month': '2', 'go-live-year': '2030' })
        .expect(res => expect(res.text).to.contain('Enter a real go-live date'));
      await agent
        .post('/account/production-credentials')
        .type('form')
        .send({ 'go-live-day': '1', 'go-live-month': '1', 'go-live-year': '2020' })
        .expect(res => expect(res.text).to.contain('The go-live date must be in the future'));
    });
  });
});
