import {
  issueClientId,
  issueClientSecret,
  issueSubscriptionKey,
  maskSecret,
  publisherIdFor,
} from '../../../main/services/Credentials';

describe('Credentials', () => {
  test('a_client_secret_should_have_the_shape_entra_issues', () => {
    const secret = issueClientSecret();

    expect(secret.value).toMatch(/^.{3}8Q~.{34}$/);
    expect(secret.hint).toBe(secret.value.slice(0, 3));
    expect(new Date(secret.expiresAt).getTime()).toBeGreaterThan(new Date(secret.createdAt).getTime());
  });

  test('a_masked_secret_should_show_only_its_hint', () => {
    expect(maskSecret('abc')).toBe('abc****');
  });

  test('ids_and_keys_should_be_unique_and_well_formed', () => {
    expect(issueClientId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(issueSubscriptionKey()).toMatch(/^[0-9a-f]{32}$/);
    expect(issueSubscriptionKey()).not.toBe(issueSubscriptionKey());
  });

  test('the_publisher_id_should_be_the_api_product_name', () => {
    expect(publisherIdFor('api-cp-crime-hearing')).toBe('cp-crime-hearing');
  });
});
