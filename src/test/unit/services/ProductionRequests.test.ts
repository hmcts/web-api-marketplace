import axios from 'axios';

import { Owner } from '../../../main/services/Applications';
import {
  getProductionRequest,
  listProductionRequests,
  submitProductionRequest,
} from '../../../main/services/ProductionRequests';

jest.mock('axios');

const mockedRequest = axios.request as jest.MockedFunction<typeof axios.request>;

const OWNER: Owner = { oid: 'aaaaaaaa-1111-2222-3333-444444444444', userReference: 'user001' };

const SUMMARY = { reference: 'PCR-ABCD2345', status: 'SUBMITTED', submittedAt: '2026-10-19T11:00:00' };

const DETAIL = {
  ...SUMMARY,
  applicationName: 'Case Viewer',
  clientId: '22222222-2222-2222-2222-222222222222',
  organisation: 'Example Legal Ltd',
  goLiveDate: '2027-03-27',
  callVolume: 'low',
  dataRequest: 'Hearing outcomes for listed cases.',
  proposedOutputs: 'A weekly outcomes report.',
};

const SUBMISSION = {
  clientId: '22222222-2222-2222-2222-222222222222',
  organisation: 'Example Legal Ltd',
  goLiveDate: '2027-03-27',
  callVolume: 'low',
  dataRequest: 'Hearing outcomes for listed cases.',
  proposedOutputs: 'A weekly outcomes report.',
};

/** The error shape axios throws, which the backend call turns into a BackendError. */
const answered = (status: number, error?: string) => ({ response: { status, data: error ? { error } : {} } });

describe('ProductionRequests', () => {
  beforeEach(() => mockedRequest.mockReset());

  test('listing_should_ask_for_the_signed_in_users_own_requests', async () => {
    mockedRequest.mockResolvedValue({ data: [SUMMARY] });

    expect(await listProductionRequests(OWNER)).toEqual([SUMMARY]);

    const [sent] = mockedRequest.mock.calls[0];
    expect(sent).toMatchObject({ method: 'GET', url: '/production-requests' });
    expect((sent as { headers: Record<string, string> }).headers.requestingUserId).toBe(OWNER.oid);
  });

  test('reading_one_should_name_it_in_the_path', async () => {
    mockedRequest.mockResolvedValue({ data: DETAIL });

    expect(await getProductionRequest(OWNER, 'PCR-ABCD2345')).toEqual(DETAIL);

    const [sent] = mockedRequest.mock.calls[0];
    expect(sent).toMatchObject({ method: 'GET', url: '/production-requests/PCR-ABCD2345' });
  });

  test('a_reference_with_a_slash_should_be_escaped_rather_than_pasted_into_the_path', async () => {
    mockedRequest.mockResolvedValue({ data: DETAIL });

    await getProductionRequest(OWNER, 'PCR/2026 X');

    expect(mockedRequest.mock.calls[0][0]).toMatchObject({ url: '/production-requests/PCR%2F2026%20X' });
  });

  test('a_reference_that_is_not_this_users_should_come_back_as_nothing', async () => {
    mockedRequest.mockRejectedValue(answered(404, 'No request with reference PCR-SOMEONE1.'));

    expect(await getProductionRequest(OWNER, 'PCR-SOMEONE1')).toBeUndefined();
  });

  test('any_other_refusal_should_be_raised_rather_than_read_as_not_found', async () => {
    mockedRequest.mockRejectedValue(answered(500, 'Something broke.'));

    await expect(getProductionRequest(OWNER, 'PCR-ABCD2345')).rejects.toThrow('Something broke.');
  });

  test('an_unreachable_backend_should_be_raised_when_reading_one', async () => {
    mockedRequest.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(getProductionRequest(OWNER, 'PCR-ABCD2345')).rejects.toThrow('Could not reach the backend');
  });

  test('submitting_should_post_the_answers_and_return_the_reference', async () => {
    mockedRequest.mockResolvedValue({ data: SUMMARY });

    expect(await submitProductionRequest(OWNER, SUBMISSION)).toEqual(SUMMARY);

    const [sent] = mockedRequest.mock.calls[0];
    expect(sent).toMatchObject({ method: 'POST', url: '/production-requests', data: SUBMISSION });
    expect((sent as { headers: Record<string, string> }).headers.requestingUserId).toBe(OWNER.oid);
  });

  test('a_refused_submission_should_be_raised_with_what_the_backend_said', async () => {
    mockedRequest.mockRejectedValue(answered(400, 'No application with client id nope.'));

    await expect(submitProductionRequest(OWNER, SUBMISSION)).rejects.toThrow('No application with client id nope.');
  });
});
