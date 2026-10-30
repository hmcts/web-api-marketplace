import * as propertiesVolume from '@hmcts/properties-volume';
import config from 'config';
import { Application } from 'express';
import { get, set } from 'lodash';

export class PropertiesVolume {
  enableFor(server: Application): void {
    if (server.locals.ENV !== 'development') {
      propertiesVolume.addTo(config);
      this.setSecret('secrets.amp.APP_INSIGHTS_CONNECTION_STRING', 'appInsights.app-insights-connection-string');
      // Load whichever vaults the chart mounted
      this.mountedVaults().forEach(vault => {
        this.setSessionSecrets(vault);
        this.setEntraSecrets(vault);
      });
    }
  }

  /** Each mounted vault is a directory under /mnt/secrets, and properties-volume keys them by name. */
  private mountedVaults(): string[] {
    const secrets = get(config, 'secrets');
    return secrets ? Object.keys(secrets) : [];
  }

  private setEntraSecrets(vault: string): void {
    this.setSecret(`secrets.${vault}.ENTRA_CLIENT_ID`, 'entra.clientId');
    this.setSecret(`secrets.${vault}.ENTRA_CLIENT_SECRET`, 'entra.clientSecret');
    this.setSecret(`secrets.${vault}.ENTRA_TENANT_ID`, 'entra.tenantId');
  }

  private setSessionSecrets(vault: string): void {
    this.setSecret(`secrets.${vault}.REDIS_HOST`, 'session.redis.host');
    this.setSecret(`secrets.${vault}.REDIS_PORT`, 'session.redis.port');
    this.setSecret(`secrets.${vault}.REDIS_KEY`, 'session.redis.key');
    this.setSecret(`secrets.${vault}.SESSION_SECRET`, 'session.secret');
    this.setSecret(`secrets.${vault}.ENTRA_CLIENT_SECRET`, 'entra.clientSecret');
  }

  private setSecret(fromPath: string, toPath: string): void {
    if (config.has(fromPath)) {
      set(config, toPath, get(config, fromPath));
    }
  }
}
