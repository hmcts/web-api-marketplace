import { Locator, expect } from '@playwright/test';

import { Base } from '../base';

export class ApiCataloguePage extends Base {
  private readonly apiLinks = this.page.locator('#main-content a.govuk-link[href^="/api-catalogue/"]');
  readonly count = this.page.locator('#catalogue-count');
  readonly lettersNav = this.page.locator('#catalogue-az');
  readonly aboutThisApi = this.page.locator('#about-this-api');
  readonly referenceLink = this.page.getByRole('link', { name: 'Read the API reference (opens in new tab)' });

  async goto(): Promise<void> {
    await this.page.goto('/api-catalogue');
  }

  async search(text: string): Promise<void> {
    await this.page.locator('#q').fill(text);
    await this.page.locator('#catalogue-search').click();
  }

  apiLink(shortCode: string): Locator {
    return this.page.locator(`#main-content a[href="/api-catalogue/${shortCode}"]`);
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
