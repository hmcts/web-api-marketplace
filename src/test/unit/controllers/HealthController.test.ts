/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { assert, match, mock, stub } from 'sinon';
import type { SinonStub } from 'sinon';

const healthcheck = {
  raw: stub().callsFake((fn: () => unknown) => fn),
  up: stub().returns({ status: 'UP' }),
  down: stub().returns({ status: 'DOWN' }),
};

const healthRoutes = {
  checkReadiness: stub(),
};

const outputs = {
  UP: 'UP',
  status: stub().callsFake((value: string) => ({ status: value })),
};

jest.mock('@hmcts/nodejs-healthcheck', () => healthcheck);
jest.mock('@hmcts/nodejs-healthcheck/healthcheck/routes', () => healthRoutes);
jest.mock('@hmcts/nodejs-healthcheck/healthcheck/outputs', () => outputs);
jest.mock('../../../main/app', () => ({ app: { locals: { shutdown: false } } }));

import HealthController from '../../../main/controllers/HealthController';

let readinessHandler: SinonStub;
let checkReadinessMock: SinonStub;
let statusMock: SinonStub;
let rawMock: SinonStub;
let upMock: SinonStub;
let downMock: SinonStub;

describe('HealthController', () => {
  beforeEach(() => {
    readinessHandler = stub();

    healthRoutes.checkReadiness.callsFake(() => readinessHandler);

    checkReadinessMock = healthRoutes.checkReadiness;
    statusMock = outputs.status;
    rawMock = healthcheck.raw;
    upMock = healthcheck.up;
    downMock = healthcheck.down;

    readinessHandler.resetHistory();
    checkReadinessMock.resetHistory();
    statusMock.resetHistory();
    rawMock.resetHistory();
    upMock.resetHistory();
    downMock.resetHistory();
  });

  test('returns liveness status', () => {
    const controller = new HealthController();
    const response = {
      json: () => '',
    } as unknown as Response;
    const responseMock = mock(response);

    responseMock.expects('json').once().withArgs({ status: 'UP' });
    controller.liveness({} as never, response);

    assert.calledWith(statusMock, 'UP');
    responseMock.verify();
  });

  test('delegates /health/readiness to readiness checks', () => {
    const controller = new HealthController();
    const request = {} as never;
    const response = {} as never;

    controller.readiness(request, response);

    assert.calledWithMatch(checkReadinessMock, match.object);
    assert.calledWith(readinessHandler, request, response);
  });
});
