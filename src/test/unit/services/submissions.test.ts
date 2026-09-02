import { AppLogger } from '../../../main/modules/logging';
import { backendUrl } from '../../../main/services/BackendHealth';
import { logNotImplemented, logSubmission, submissionEndpoint } from '../../../main/services/submissions';

const capturingLogger = () => {
  const lines: string[] = [];
  return { lines, logger: { info: (line: string) => lines.push(line) } as unknown as AppLogger };
};

describe('submissions', () => {
  test('an_endpoint_should_be_the_backend_url_joined_to_the_path', () => {
    expect(submissionEndpoint('/login')).toBe(`${backendUrl}/login`);
  });

  test('a_submission_should_be_logged_with_the_endpoint_it_is_sent_to', () => {
    const { lines, logger } = capturingLogger();

    logSubmission(logger, 'Sign in', '/login');

    expect(lines).toEqual([`Sign in: submitting to POST ${backendUrl}/login`]);
  });

  test('a_form_with_no_backend_should_be_logged_as_not_implemented', () => {
    const { lines, logger } = capturingLogger();

    logNotImplemented(logger, 'Access request', 'AMP-ABCD1234 for api-cp-ai-rag');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('not implemented');
    expect(lines[0]).toContain('nothing was persisted');
    expect(lines[0]).toContain('AMP-ABCD1234 for api-cp-ai-rag');
  });
});
