import { InjectionMode, asValue, createContainer } from 'awilix';
import { Application } from 'express';

import { Logger } from '../logging';

const logger = Logger.getLogger('app');

export class Container {
  public enableFor(app: Application): void {
    app.locals.container = createContainer({
      injectionMode: InjectionMode.CLASSIC,
    }).register({
      logger: asValue(logger),
    });
  }
}
