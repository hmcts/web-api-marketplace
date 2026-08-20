import { WaitUtils } from '@hmcts/playwright-common';
import { Locator, Page, expect } from '@playwright/test';

export class TitleComponent {
  readonly title: Locator;
  private readonly waitUtils = new WaitUtils();

  constructor(page: Page) {
    this.title = page.locator('section.govuk-service-navigation');
  }

  async checkIsVisible(): Promise<void> {
    await this.waitUtils.waitForLocatorVisibility(this.title, { visibility: true });
    await expect(this.title).toBeVisible();
  }
}
