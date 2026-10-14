import { sendEmail } from '../../../main/services/Notify';

describe('Notify', () => {
  test('an_email_should_be_handed_back_unchanged_for_the_page_to_preview', () => {
    const email = {
      template: 'production-request-received' as const,
      to: 'ada@example.com',
      subject: 'Request received',
      paragraphs: ['Hello'],
      link: { text: 'View your request', href: '/account/production-credentials/AMP-1' },
    };

    expect(sendEmail(email)).toBe(email);
  });

  test('an_address_without_a_domain_should_still_be_handled', () => {
    expect(
      sendEmail({ template: 'production-request-received', to: 'nonsense', subject: 's', paragraphs: [] }).to
    ).toBe('nonsense');
  });
});
