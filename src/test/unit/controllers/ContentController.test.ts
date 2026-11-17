import { Response } from 'express';

import ContentController, { CONTENT_PAGES, MOVED_PAGES } from '../../../main/controllers/ContentController';
import { anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

describe('ContentController', () => {
  test.each(Object.entries(CONTENT_PAGES))('%s_should_render_%s', (path, view) => {
    const req = anonymous();
    (req as { path: string }).path = path;
    const res = mockResponse();

    new ContentController().get(req, res);

    expect(res.view).toBe(view);
  });

  test.each(Object.entries(MOVED_PAGES))('%s_should_redirect_permanently_to_%s', (path, to) => {
    const req = anonymous();
    (req as { path: string }).path = path;
    const res = { redirect: jest.fn() } as unknown as Response;

    new ContentController().moved(req, res);

    expect(res.redirect).toHaveBeenCalledWith(301, to);
  });

  test('a_trailing_slash_should_reach_the_same_page', () => {
    const req = anonymous();
    (req as { path: string }).path = '/get-started/';
    const res = mockResponse();

    new ContentController().get(req, res);

    expect(res.view).toBe('content/get-started/index');
  });
});
