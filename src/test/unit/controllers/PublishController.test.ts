import { Request, Response } from 'express';

import PublishController from '../../../main/controllers/PublishController';

function mockResponse(): Response & { view?: string } {
  const res: Record<string, unknown> = {};
  res.render = jest.fn().mockImplementation((view: string) => {
    res.view = view;
  });
  return res as never;
}

describe('PublishController', () => {
  test.each([
    ['get', 'publish/index'],
    ['producerStandards', 'publish/producer-standards'],
    ['dataGovernance', 'publish/data-governance'],
  ])('calling_%s_should_render_the_%s_view', (method: string, view: string) => {
    const controller = new PublishController() as unknown as Record<string, (req: Request, res: Response) => void>;
    const res = mockResponse();

    controller[method]({} as Request, res);

    expect(res.view).toBe(view);
  });
});
