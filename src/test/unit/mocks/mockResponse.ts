import { Response } from 'express';

/**
 * A response that records what a controller did with it, rather than writing anything.
 *
 * Shared because every controller test needs the same thing, and six near-identical copies
 * of it tripped Sonar's duplication threshold. Each field is set only if the controller
 * used it, so asserting that `view` is undefined means nothing was rendered.
 */
export type MockResponse = Response & {
  statusCode?: number;
  view?: string;
  data?: Record<string, unknown>;
  body?: unknown;
  redirected?: string;
  cleared?: string;
};

export const mockResponse = (): MockResponse => {
  const res: Record<string, unknown> = {};

  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.render = jest.fn().mockImplementation((view: string, data?: Record<string, unknown>) => {
    res.view = view;
    res.data = data;
  });
  res.json = jest.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  res.redirect = jest.fn().mockImplementation((to: string) => {
    res.redirected = to;
  });
  res.clearCookie = jest.fn().mockImplementation((name: string) => {
    res.cleared = name;
  });
  res.sendFile = jest.fn();

  return res as never;
};
