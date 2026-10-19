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

  test('an_environment_that_asks_for_it_in_development_should_have_it', () => {
    env({ BYPASS_ENTRA: 'true', NODE_ENV: 'development' });

    expect(entraBypass.enabled).toBe(true);
    expect(entraBypass.refused).toBe(false);
  });

  test('an_unset_node_env_should_leave_it_off', () => {
    // Nothing deployed sets NODE_ENV, so the bypass must not treat absence as development.
    env({ BYPASS_ENTRA: 'true', NODE_ENV: undefined });

    expect(entraBypass.enabled).toBe(false);
    expect(entraBypass.refused).toBe(true);
  });

  test('nothing_set_should_leave_it_off', () => {
    env({ BYPASS_ENTRA: undefined, NODE_ENV: 'development' });

    expect(entraBypass.enabled).toBe(false);
    expect(entraBypass.refused).toBe(false);
  });

  test('production_should_refuse_it_however_the_variable_is_set', () => {
    // The guard that matters: every deployed environment runs as production, so setting
    // the variable there cannot switch the bypass on.
    env({ BYPASS_ENTRA: 'true', NODE_ENV: 'production' });

    expect(entraBypass.enabled).toBe(false);
    expect(entraBypass.refused).toBe(true);
  });

  test('anything_other_than_the_exact_word_true_should_leave_it_off', () => {
    for (const value of ['TRUE', 'yes', '1', 'on', ' true', 'false', '']) {
      env({ BYPASS_ENTRA: value, NODE_ENV: 'development' });

      expect(entraBypass.enabled).toBe(false);
    }
  });

  test('the_user_should_be_john_doe', () => {
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
