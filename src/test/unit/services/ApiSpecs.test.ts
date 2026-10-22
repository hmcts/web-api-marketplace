import axios from 'axios';

import { clearSpecCache, getSpecDescription, paragraphsOf } from '../../../main/services/ApiSpecs';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const NAME = 'api-cp-crime-schedulingandlisting-courtschedule';

const spec = `openapi: 3.0.0
info:
  title: Common Platform API Scheduling and Listing Court Schedule
  description: |
    Returns the court hearing schedule for a given case, showing when and where
    hearings are listed to take place.

    For each hearing the response includes the court building and the judge assigned.
  version: 0.0.0
`;

describe('ApiSpecs', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    clearSpecCache();
  });

  test('the_description_should_be_read_from_the_spec_on_the_apis_documentation_site', async () => {
    mockedGet.mockResolvedValue({ data: spec });

    const description = await getSpecDescription(NAME);

    expect(mockedGet.mock.calls[0][0]).toBe(`https://hmcts.github.io/${NAME}/openapi-spec.yml`);
    expect(description).toBe(
      'Returns the court hearing schedule for a given case, showing when and where\n' +
        'hearings are listed to take place.\n\n' +
        'For each hearing the response includes the court building and the judge assigned.'
    );
  });

  test('the_spec_should_be_fetched_with_a_timeout_and_a_size_limit', async () => {
    mockedGet.mockResolvedValue({ data: spec });

    await getSpecDescription(NAME);

    expect(mockedGet.mock.calls[0][1]).toMatchObject({ timeout: 5000, maxContentLength: 512 * 1024 });
  });

  test('a_second_request_should_come_from_the_cache', async () => {
    mockedGet.mockResolvedValue({ data: spec });

    await getSpecDescription(NAME);
    await getSpecDescription(NAME);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  test('a_failed_fetch_should_give_nothing_and_not_be_retried_straight_away', async () => {
    mockedGet.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

    expect(await getSpecDescription(NAME)).toBeUndefined();
    expect(await getSpecDescription(NAME)).toBeUndefined();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['not_yaml', 'info: [unclosed'],
    ['no_info', 'openapi: 3.0.0\n'],
    ['no_description', 'info:\n  title: An API\n'],
    ['a_description_that_is_not_text', 'info:\n  description:\n    - one\n    - two\n'],
    ['an_empty_description', 'info:\n  description: "   "\n'],
    ['an_empty_file', ''],
  ])('a_spec_with_%s_should_give_nothing', async (_label, data) => {
    mockedGet.mockResolvedValue({ data });

    expect(await getSpecDescription(NAME)).toBeUndefined();
  });

  test('an_absurdly_long_description_should_be_ignored', async () => {
    mockedGet.mockResolvedValue({ data: `info:\n  description: ${'x'.repeat(5001)}\n` });

    expect(await getSpecDescription(NAME)).toBeUndefined();
  });

  test('yaml_that_tries_to_run_code_should_only_ever_be_read_as_data', async () => {
    mockedGet.mockResolvedValue({ data: 'info:\n  description: !!js/function "function () { return 1 }"\n' });

    expect(await getSpecDescription(NAME)).toBeUndefined();
  });

  describe('paragraphsOf', () => {
    test('blank_lines_should_separate_paragraphs_and_wrapped_lines_should_join', () => {
      expect(paragraphsOf('One that\nwraps.\n\nTwo.\n  \nThree.')).toEqual(['One that wraps.', 'Two.', 'Three.']);
    });

    test('nothing_to_show_should_give_no_paragraphs', () => {
      expect(paragraphsOf(' \n\n ')).toEqual([]);
    });
  });
});
