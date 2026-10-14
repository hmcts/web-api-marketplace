/** Unsets the given environment variables before each test and restores them after. */
export function withCleanEnv(names: string[]): void {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    names.forEach(name => {
      saved[name] = process.env[name];
      delete process.env[name];
    });
  });

  afterEach(() => {
    names.forEach(name => {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    });
  });
}
