/* eslint-disable jest/expect-expect */
import { Request, Response } from 'express';
import { mock } from 'sinon';

import GetStartedController from '../../../main/controllers/GetStartedController';

const cases: [keyof GetStartedController, string][] = [
  ['get', 'get-started/index'],
  ['buildingSoftware', 'get-started/building-software'],
  ['consumerGuidance', 'get-started/consumer-guidance'],
  ['glossary', 'get-started/glossary'],
  ['onboardingGuide', 'get-started/onboarding-guide'],
  ['technologyIntroduction', 'get-started/technology-introduction'],
];

describe('GetStartedController', () => {
  test.each(cases)('%s_should_render_the_%s_view', (method, view) => {
    const controller = new GetStartedController();
    const response = { render: () => '' } as unknown as Response;
    const responseMock = mock(response);

    responseMock.expects('render').once().withArgs(view);
    (controller[method] as (req: Request, res: Response) => void)({} as Request, response);
    responseMock.verify();
  });
});
