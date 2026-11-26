import { entraBypass } from '../../../main/services/EntraBypass';

/**
 * BYPASS_ENTRA is an authentication bypass, so what is tested here is mostly the ways it
 * stays off.
 */
describe('EntraBypass', () => {
  const environment = { ...process.env };

  afterEach(() => {
    process.env = { ...environment };
  });

  const env = (values: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };

  test('the_bypass_should_be_on_when_asked_for_in_development', () => {
    env({ BYPASS_ENTRA: 'true', NODE_ENV: 'development' });

    expect(entraBypass.enabled).toBe(true);
    expect(entraBypass.refused).toBe(false);
  });

  test('an_unset_node_env_should_refuse_the_bypass', () => {
    // Nothing deployed sets NODE_ENV, so the bypass must not treat absence as development.
    env({ BYPASS_ENTRA: 'true', NODE_ENV: undefined });

    expect(entraBypass.enabled).toBe(false);
    expect(entraBypass.refused).toBe(true);
  });

  test('the_bypass_should_be_off_but_not_refused_when_nobody_asks_for_it', () => {
    env({ BYPASS_ENTRA: undefined, NODE_ENV: 'development' });

    expect(entraBypass.enabled).toBe(false);
    expect(entraBypass.refused).toBe(false);
  });

  test('production_should_refuse_the_bypass_even_when_asked_for', () => {
    // The guard that matters: every deployed environment runs as production, so setting
    // the variable there cannot switch the bypass on.
    env({ BYPASS_ENTRA: 'true', NODE_ENV: 'production' });

    expect(entraBypass.enabled).toBe(false);
    expect(entraBypass.refused).toBe(true);
  });

  test('anything_other_than_the_exact_word_true_should_leave_the_bypass_off', () => {
    for (const value of ['TRUE', 'yes', '1', 'on', ' true', 'false', '']) {
      env({ BYPASS_ENTRA: value, NODE_ENV: 'development' });

      expect(entraBypass.enabled).toBe(false);
    }
  });

  test('the_bypass_user_should_be_john_doe', () => {
    expect(entraBypass.claims).toEqual({
      oid: '00000000-0000-4000-8000-00000000d0e0',
      email: 'john.doe@example.com',
      name: 'John Doe',
    });
  });

  test('the_variables_should_be_read_each_time_not_fixed_at_import', () => {
    env({ BYPASS_ENTRA: undefined });
    expect(entraBypass.enabled).toBe(false);

    env({ BYPASS_ENTRA: 'true', NODE_ENV: 'development' });
    expect(entraBypass.enabled).toBe(true);
  });
});
