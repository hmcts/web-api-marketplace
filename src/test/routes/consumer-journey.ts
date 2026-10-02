import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
}));

import { app } from '../../main/app';
import { MemoryStore, useDataStore } from '../../main/modules/store';

import {
  CATALOGUE,
  PASSWORD,
  createdApplication,
  emailLink,
  registeredAccount,
  signedInConsumer,
} from './helpers/consumer';

const { getCatalogueApis } = require('../../main/services/ApiCatalogue');

/**
 * The consumer onboarding journey end to end, through the real app: create an account,
 * confirm the address, sign in, get through the welcome, create an application, manage its
 * APIs and credentials, ask for production credentials, and tidy up.
 */
describe('Consumer onboarding journey', () => {
  beforeEach(() => {
    useDataStore(new MemoryStore());
    (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE);
  });

  describe('creating an account', () => {
    test('registering_should_ask_the_user_to_check_their_email_and_preview_the_link', async () => {
      const agent = request.agent(app);

      await agent
        .post('/register')
        .type('form')
        .send({
          'first-name': 'Ada',
          'last-name': 'Lovelace',
          email: 'ada@example.com',
          organisation: 'Analytical Engines Ltd',
          role: 'consumer',
          password: PASSWORD,
          'password-confirm': PASSWORD,
        })
        .expect(res => expect(res.headers.location).to.equal('/register/check-email'));

      await agent.get('/register/check-email').expect(res => {
        expect(res.text).to.contain('Check your email');
        expect(res.text).to.contain('ada@example.com');
        expect(emailLink(res.text)).to.match(/^\/verify-email\?token=/);
      });
    });

    test('an_incomplete_form_should_report_every_problem', async () => {
      await request(app)
        .post('/register')
        .type('form')
        .send({ password: 'short', 'password-confirm': 'short' })
        .expect(res => {
          expect(res.status).to.equal(400);
          for (const message of [
            'Enter your first name',
            'Enter your last name',
            'Enter your email address',
            'Enter your organisation or team',
            'Select whether you are registering as a consumer or a producer',
            'at least 12 characters',
          ]) {
            expect(res.text).to.contain(message);
          }
        });
    });

    test('registering_an_address_twice_should_look_the_same_but_send_an_already_registered_email', async () => {
      await registeredAccount('ada@example.com');
      const agent = request.agent(app);

      await agent
        .post('/register')
        .type('form')
        .send({
          'first-name': 'Someone',
          'last-name': 'Else',
          email: 'ADA@example.com',
          organisation: 'Elsewhere',
          role: 'consumer',
          password: 'a different password',
          'password-confirm': 'a different password',
        })
        .expect(302);

      await agent.get('/register/check-email').expect(res => {
        expect(res.text).to.contain('Check your email');
        expect(res.text).to.contain('You already have an account');
        expect(emailLink(res.text)).to.equal('/sign-in');
      });
    });

    test('signing_in_before_confirming_should_say_so_and_offer_a_new_email', async () => {
      const agent = request.agent(app);
      await agent.post('/register').type('form').send({
        'first-name': 'Ada',
        'last-name': 'Lovelace',
        email: 'ada@example.com',
        organisation: 'Analytical Engines Ltd',
        role: 'consumer',
        password: PASSWORD,
        'password-confirm': PASSWORD,
      });

      await agent
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(res => {
          expect(res.status).to.equal(401);
          expect(res.text).to.contain('You need to confirm your email address');
          expect(res.text).to.contain('href="/verify-email/resend"');
        });
    });

    test('a_confirmation_link_should_work_once', async () => {
      const agent = request.agent(app);
      await agent.post('/register').type('form').send({
        'first-name': 'Ada',
        'last-name': 'Lovelace',
        email: 'ada@example.com',
        organisation: 'Analytical Engines Ltd',
        role: 'consumer',
        password: PASSWORD,
        'password-confirm': PASSWORD,
      });
      const link = emailLink((await agent.get('/register/check-email')).text);

      await agent.get(link).expect(res => expect(res.text).to.contain('Email address confirmed'));
      await agent.get(link).expect(res => {
        expect(res.status).to.equal(400);
        expect(res.text).to.contain('This link has expired');
      });
    });

    test('resending_should_send_a_link_that_confirms_the_account', async () => {
      const agent = request.agent(app);
      await agent.post('/register').type('form').send({
        'first-name': 'Ada',
        'last-name': 'Lovelace',
        email: 'ada@example.com',
        organisation: 'Analytical Engines Ltd',
        role: 'consumer',
        password: PASSWORD,
        'password-confirm': PASSWORD,
      });

      await agent.post('/verify-email/resend').type('form').send({ email: 'ada@example.com' }).expect(302);
      const link = emailLink((await agent.get('/register/check-email')).text);

      await agent.get(link).expect(res => expect(res.text).to.contain('Email address confirmed'));
    });
  });

  describe('signing in', () => {
    test('the_first_sign_in_should_go_through_the_welcome_and_on_to_applications', async () => {
      const agent = await registeredAccount('ada@example.com');

      await agent
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(res => expect(res.headers.location).to.equal('/account/welcome'));

      await agent.get('/account/welcome').expect(res => {
        expect(res.text).to.contain('Welcome, Ada');
        expect(res.text).to.contain('Analytical Engines Ltd');
      });
      await agent
        .post('/account/welcome')
        .type('form')
        .send({})
        .expect(res => {
          expect(res.status).to.equal(400);
          expect(res.text).to.contain('Confirm that you have read and agree to the guidelines');
        });
      await agent
        .post('/account/welcome')
        .type('form')
        .send({ agree: 'yes' })
        .expect(res => expect(res.headers.location).to.equal('/account/applications'));
    });

    test('later_sign_ins_should_skip_the_welcome', async () => {
      const agent = await signedInConsumer('ada@example.com');
      await agent.post('/sign-out').expect(302);

      await agent
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(res => expect(res.headers.location).to.equal('/account'));
    });

    test('a_wrong_password_should_be_refused_without_asking_the_backend', async () => {
      await registeredAccount('ada@example.com');

      await request(app)
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: 'not the password' })
        .expect(res => {
          expect(res.status).to.equal(401);
          expect(res.text).to.contain('Incorrect email or password');
        });
    });

    test('signing_in_should_return_to_the_page_that_asked_for_it', async () => {
      const agent = await signedInConsumer('ada@example.com');
      await agent.post('/sign-out');

      await agent
        .get('/account/production-credentials')
        .expect(res => expect(res.headers.location).to.equal('/sign-in'));
      await agent
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(res => expect(res.headers.location).to.equal('/account/production-credentials'));
    });
  });

  describe('forgotten password', () => {
    test('resetting_should_replace_the_password', async () => {
      await registeredAccount('ada@example.com');
      const agent = request.agent(app);

      await agent.post('/forgotten-password').type('form').send({ email: 'ada@example.com' }).expect(302);
      const link = emailLink((await agent.get('/forgotten-password/check-email')).text);
      expect(link).to.match(/^\/reset-password\?token=/);

      const token = new URL(link, 'http://localhost').searchParams.get('token');
      await agent.get(link).expect(res => expect(res.text).to.contain('Create a new password'));
      await agent
        .post('/reset-password')
        .type('form')
        .send({ token, password: 'a brand new password', 'password-confirm': 'something else' })
        .expect(res => expect(res.text).to.contain('The passwords you entered do not match'));
      await agent
        .post('/reset-password')
        .type('form')
        .send({ token, password: 'a brand new password', 'password-confirm': 'a brand new password' })
        .expect(res => expect(res.text).to.contain('Your password has been changed'));

      await agent.get(link).expect(res => expect(res.text).to.contain('This link has expired'));
      await request(app)
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(401);
      await request(app)
        .post('/sign-in')
        .type('form')
        .send({ email: 'ada@example.com', password: 'a brand new password' })
        .expect(302);
    });

    test('an_unknown_address_should_get_the_same_page_and_no_link', async () => {
      const agent = request.agent(app);

      await agent.post('/forgotten-password').type('form').send({ email: 'nobody@example.com' }).expect(302);
      await agent.get('/forgotten-password/check-email').expect(res => {
        expect(res.text).to.contain('Check your email');
        expect(res.text).to.not.contain('email-preview-link');
      });
    });
  });

  describe('applications', () => {
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
          expect(res.text).to.contain('Select an environment');
          expect(res.text).to.contain('Enter an application name');
        });
      await agent
        .post('/account/applications/new/details')
        .type('form')
        .send({ environment: 'sandbox', name: 'Case tracker' });
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
        expect(res.text).to.contain('Sandbox');
        expect(res.text).to.contain('CP Crime Hearing API, Defendant Details');
      });

      const created = await agent.post('/account/applications/new/check-answers').expect(200);
      const secret = /id="client-secret"[^>]*>([^<]+)</.exec(created.text)?.[1] as string;
      const id = /href="\/account\/applications\/([0-9a-f-]{36})"/.exec(created.text)?.[1] as string;

      expect(created.text).to.contain('Application created');
      expect(created.text).to.contain('You will not be able to see it again');
      // Entra's shape: 40 characters, "8Q~" from the fourth.
      expect(secret).to.match(/^.{3}8Q~.{34}$/);
      expect(created.text.match(/Subscription key: <span class="apim-credential">[0-9a-f]{32}</g)).to.have.length(2);

      await agent.get(`/account/applications/${id}`).expect(res => {
        expect(res.text).to.contain(`${secret.slice(0, 3)}****`);
        expect(res.text).to.not.contain(secret);
        expect(res.text).to.contain('crime-hearing');
      });

      // The draft is gone, so a resubmitted form cannot create a second application.
      await agent.post('/account/applications/new/check-answers').expect(302);
      await agent.get('/account/applications').expect(res => expect(res.text.match(/Case tracker/g)).to.have.length(1));
    });

    test('the_same_name_cannot_be_used_twice_in_one_environment', async () => {
      const agent = await signedInConsumer('ada@example.com');
      await createdApplication(agent, 'Case tracker');

      await agent
        .post('/account/applications/new/details')
        .type('form')
        .send({ environment: 'sandbox', name: 'case tracker' })
        .expect(res =>
          expect(res.text).to.contain('You already have an application with this name in this environment')
        );
      await agent
        .post('/account/applications/new/details')
        .type('form')
        .send({ environment: 'aat', name: 'Case tracker' })
        .expect(302);
    });

    test('viewing_an_api_should_show_its_publisher_id_and_subscription_key', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

      await agent.get(`/account/applications/${id}/apis/${CATALOGUE[0].name}`).expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.match(/id="publisher-id">cp-crime-hearing</);
        expect(res.text).to.match(/id="subscription-key">[0-9a-f]{32}</);
      });
      await agent.get(`/account/applications/${id}/apis/api-not-subscribed`).expect(404);
    });

    test('adding_and_removing_apis_should_say_what_changed', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

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
    });

    test('regenerating_the_secret_should_show_a_new_one_once', async () => {
      const agent = await signedInConsumer('ada@example.com');
      const id = await createdApplication(agent);

      await agent.get(`/account/applications/${id}/client-secret`).expect(res => {
        expect(res.text).to.contain('The current secret will stop working straight away');
      });
      await agent.post(`/account/applications/${id}/client-secret`).expect(res => {
        expect(res.text).to.contain('Client secret regenerated');
        expect(res.text).to.match(/id="client-secret"[^>]*>.{3}8Q~/);
      });
    });

    test('deleting_should_remove_the_application', async () => {
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
    });

    test('one_user_should_not_be_able_to_see_another_users_application', async () => {
      const owner = await signedInConsumer('ada@example.com');
      const id = await createdApplication(owner);
      const stranger = await signedInConsumer('charles@example.com');

      expect((await stranger.get(`/account/applications/${id}`)).status).to.equal(404);
      expect(
        (await stranger.post(`/account/applications/${id}/delete`).type('form').send({ confirm: 'yes' })).status
      ).to.equal(404);
      expect((await owner.get(`/account/applications/${id}`)).status, 'the owner still has it').to.equal(200);
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
      });
      await agent
        .post('/account/production-credentials')
        .type('form')
        .send({})
        .expect(res => {
          expect(res.status).to.equal(400);
          expect(res.text).to.contain('Select the application you need production credentials for');
          expect(res.text).to.contain('You must confirm the declaration');
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
          dpia: 'yes',
          dsa: 'in-place',
          'security-contact': 'security@example.com',
          'use-case': 'Case workers look up hearing outcomes.',
          declaration: 'confirmed',
        })
        .expect(res => expect(res.headers.location).to.equal('/account/production-credentials/check-answers'));

      await agent.get('/account/production-credentials/check-answers').expect(res => {
        expect(res.text).to.contain('Case tracker (Sandbox)');
        expect(res.text).to.contain('1 April');
      });

      const confirmation = await agent.post('/account/production-credentials/check-answers').expect(200);
      const reference = /id="confirmation-reference">(PCR-[0-9A-F]{8})</.exec(confirmation.text)?.[1] as string;
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

  describe('requests from an account registered here', () => {
    test('subscribe_publish_and_new_api_requests_should_all_appear_under_my_requests', async () => {
      const agent = await signedInConsumer('ada@example.com');

      await agent
        .post('/subscribe/check-answers')
        .type('form')
        .send({
          'api-name': CATALOGUE[0].name,
          'call-volume': 'low',
          'use-case': 'Testing',
          declarations: ['in-scope', 'oauth-ready', 'dsa-dpa', 'governance'],
        })
        .expect(res => expect(res.text).to.match(/id="confirmation-reference">SUB-/));
      await agent
        .post('/publish/check-answers')
        .type('form')
        .send({
          'api-name': 'My API',
          'owning-team': 'My team',
          'contact-email': 'team@example.com',
          'spec-url': 'https://example.com/openapi.yml',
        })
        .expect(res => expect(res.text).to.match(/id="confirmation-reference">PUB-/));
      await agent
        .post('/api-catalogue/request-new-api')
        .type('form')
        .send({ need: 'Prison release dates', domain: 'case-administration', urgency: 'high' })
        .expect(302);
      await agent
        .post('/api-catalogue/request-new-api/check-answers')
        .expect(res => expect(res.text).to.match(/id="confirmation-reference">NEW-/));

      const account = await agent.get('/account');
      expect(account.text).to.contain('Subscribe to an API');
      expect(account.text).to.contain('Publish an API');
      expect(account.text).to.contain('Request a new API');

      const reference = /(SUB-[0-9A-F]{8})/.exec(account.text)?.[1] as string;
      await agent.post('/account/delete-request').type('form').send({ reference, type: 'SUBSCRIPTION' }).expect(302);
      await agent.get('/account').expect(res => {
        expect(res.text).to.contain('Your request has been deleted');
        expect(res.text).to.not.contain(reference);
      });
    });
  });
});
