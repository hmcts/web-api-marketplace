import { expect } from '@playwright/test';

import { Base } from '../base';

export class ApiCataloguePage extends Base {
  private readonly apiLinks = this.page.locator('#main-content a.govuk-link[href^="/api-catalogue/"]');

  async goto(): Promise<void> {
    await this.page.goto('/api-catalogue');
  }

  async expectHeadingToContainText(text: string): Promise<void> {
    await expect(this.heading).toContainText(text);
  }

  async expectAtLeastOneApi(): Promise<void> {
    await expect(this.apiLinks.first()).toBeVisible();
  }

  async openFirstApi(): Promise<string> {
    const title = (await this.apiLinks.first().innerText()).trim();
    await this.apiLinks.first().click();
    return title;
  }
}
