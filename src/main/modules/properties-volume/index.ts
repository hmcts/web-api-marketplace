import * as propertiesVolume from '@hmcts/properties-volume';
import config from 'config';
import { Application } from 'express';
import { get, set } from 'lodash';

const VAULTS = ['apim', 'apim-sbox'];

export class PropertiesVolume {
  enableFor(server: Application): void {
    if (server.locals.ENV !== 'development') {
      propertiesVolume.addTo(config);
      this.setSecret('secrets.apim.APP_INSIGHTS_CONNECTION_STRING', 'appInsights.app-insights-connection-string');
      VAULTS.forEach(vault => this.setSessionSecrets(vault));
    }
  }

  private setSessionSecrets(vault: string): void {
    this.setSecret(`secrets.${vault}.REDIS_HOST`, 'session.redis.host');
    this.setSecret(`secrets.${vault}.REDIS_PORT`, 'session.redis.port');
    this.setSecret(`secrets.${vault}.REDIS_KEY`, 'session.redis.key');
    this.setSecret(`secrets.${vault}.SESSION_SECRET`, 'session.secret');
  }

  private setSecret(fromPath: string, toPath: string): void {
    if (config.has(fromPath)) {
      set(config, toPath, get(config, fromPath));
    }
  }
}
