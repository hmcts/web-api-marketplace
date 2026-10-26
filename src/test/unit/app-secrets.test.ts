import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The app built outside development, as a deployed environment builds it, with the real
 * config package and the real properties volume reading a mounted vault. config locks itself on its first get(), so
 * anything that reads it before the volume is added leaves every mounted secret unread - and,
 * since Entra became required, a pod that will not start.
 */
describe('Secrets mounted from Key Vault', () => {
  // Named like AKS's /mnt/secrets/, since the library files what it reads under the directory's name.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  const mount = path.join(root, 'secrets');
  const savedClientId = process.env.ENTRA_CLIENT_ID;

  beforeAll(() => {
    fs.mkdirSync(mount);
    const vault = (name: string, secrets: Record<string, string>) => {
      fs.mkdirSync(path.join(mount, name));
      Object.entries(secrets).forEach(([key, value]) => fs.writeFileSync(path.join(mount, name, key), value));
    };
    vault('amp-sbox', { SESSION_SECRET: 'a-mounted-session-secret' });
    vault('kvspsextidsbox', { ENTRA_CLIENT_ID: 'a-mounted-client-id' });

    delete process.env.ENTRA_CLIENT_ID;
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (savedClientId !== undefined) {
      process.env.ENTRA_CLIENT_ID = savedClientId;
    }
  });

  test('should_reach_the_config_when_the_app_is_built', () => {
    let config: { get<T>(name: string): T } | undefined;
    let clientId: string | undefined;

    jest.isolateModules(() => {
      jest.doMock('@hmcts/properties-volume', () => {
        const actual = jest.requireActual('@hmcts/properties-volume');
        return { ...actual, addTo: (target: object) => actual.addTo(target, { mountPoint: `${mount}/` }) };
      });
      require('../../main/app');
      config = require('config');
      clientId = require('../../main/modules/entra/config').entraConfig.clientId;
    });

    expect(config?.get('session.secret')).toBe('a-mounted-session-secret');
    expect(clientId).toBe('a-mounted-client-id');
  });
});
