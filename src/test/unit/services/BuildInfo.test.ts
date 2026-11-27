jest.mock('axios');
jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));

const VERSION_FILE = [
  'version: 0.0.1',
  'number: 237',
  'commit: 489cd9610dc402d43daec963d378a0180d45407a',
  'date: Fri Nov 27 08:18:38 UTC 2026',
].join('\n');

const SERVICE_INFO = {
  git: { branch: 'master', commit: { id: '840eb3e', time: '2026-11-27T09:55:37Z' } },
  build: { time: '2026-11-27T09:57:47.444Z', version: '0.0.1' },
};

describe('BuildInfo', () => {
  test('both_builds_should_read_as_a_short_commit_and_a_build_time', async () => {
    const { builds } = load();

    expect(await builds()).toEqual({
      web: '489cd961 · 27 Nov, 08:18',
      service: '840eb3e · 27 Nov, 09:57',
    });
  });

  test('a_missing_version_file_should_leave_the_web_build_unknown', async () => {
    const { builds, readFile } = load();
    readFile.mockRejectedValue(new Error('ENOENT'));

    expect((await builds()).web).toBe('unknown');
  });

  test('an_unreachable_backend_should_leave_the_service_build_unknown', async () => {
    const { builds, get } = load();
    get.mockRejectedValue(new Error('connect ECONNREFUSED'));

    expect((await builds()).service).toBe('unknown');
  });

  test('a_second_admin_page_should_not_ask_the_backend_again', async () => {
    const { builds, get, readFile } = load();

    await builds();
    await builds();

    expect(get).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  test('an_unreachable_backend_should_not_be_retried_on_every_page', async () => {
    const { builds, get } = load();
    get.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await builds();
    await builds();

    expect(get).toHaveBeenCalledTimes(1);
  });

  test('a_backend_that_reports_no_commit_should_read_unknown_rather_than_blank', async () => {
    const { builds, get } = load();
    get.mockResolvedValue({ data: {} });

    expect((await builds()).service).toBe('unknown');
  });
});

/** Both reads are cached for the life of the module, so each test needs its own copy of it. */
function load() {
  jest.resetModules();

  const get = require('axios').get as jest.Mock;
  const readFile = require('node:fs/promises').readFile as jest.Mock;
  get.mockReset();
  readFile.mockReset();
  readFile.mockResolvedValue(VERSION_FILE);
  get.mockResolvedValue({ data: SERVICE_INFO });

  const { builds } = require('../../../main/services/BuildInfo');

  return { builds, get, readFile };
}
