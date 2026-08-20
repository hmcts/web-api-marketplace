/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { assert, match, mock, stub } from 'sinon';
import type { SinonStub } from 'sinon';

import InfoController from '../../../main/controllers/InfoController';

jest.mock('@hmcts/info-provider', () => {
  const sinonLib = require('sinon');
  return {
    infoRequestHandler: sinonLib.stub(),
    InfoContributor: jest.fn().mockImplementation(() => ({})),
  };
});

describe('InfoController', () => {
  test('getting_info_should_delegate_to_the_info_request_handler', async () => {
    const infoProvider = require('@hmcts/info-provider');
    const infoRequestHandlerStub = infoProvider.infoRequestHandler as SinonStub;
    const handler = stub();
    infoRequestHandlerStub.returns(handler);

    const controller = new InfoController();
    const request = {} as never;
    const response = {
      end: () => '',
    } as unknown as Response;
    const responseMock = mock(response);
    const next = stub();

    responseMock.expects('end').never();
    await controller.get(request, response, next);

    assert.calledOnce(infoRequestHandlerStub);
    assert.calledWithMatch(infoRequestHandlerStub, {
      extraBuildInfo: match({ name: 'API Marketplace Public Frontend' }),
    });
    assert.calledWith(handler, request, response, next);
    responseMock.verify();
  });
});
