import { Request, Response } from 'express';

import HelpController from '../../../main/controllers/HelpController';
import { mockResponse } from '../mocks/mockResponse';

describe('HelpController', () => {
  test.each([
    ['get', 'help/index'],
    ['resources', 'help/resources'],
  ])('calling_%s_should_render_the_%s_view', (method: string, view: string) => {
    const controller = new HelpController() as unknown as Record<string, (req: Request, res: Response) => void>;
    const res = mockResponse();

    controller[method]({} as Request, res);

    expect(res.view).toBe(view);
  });
});
