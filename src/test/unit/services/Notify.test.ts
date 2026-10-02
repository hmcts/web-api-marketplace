import { sendEmail } from '../../../main/services/Notify';

describe('Notify', () => {
  test('an_email_should_be_handed_back_unchanged_for_the_page_to_preview', () => {
    const email = {
      template: 'verify-email' as const,
      to: 'ada@example.com',
      subject: 'Confirm',
      paragraphs: ['Hello'],
      link: { text: 'Confirm', href: '/verify-email?token=secret' },
    };

    expect(sendEmail(email)).toBe(email);
  });

  test('an_address_without_a_domain_should_still_be_handled', () => {
    expect(sendEmail({ template: 'reset-password', to: 'nonsense', subject: 's', paragraphs: [] }).to).toBe('nonsense');
  });
});
