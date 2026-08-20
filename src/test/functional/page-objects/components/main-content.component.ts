import { WaitUtils } from '@hmcts/playwright-common';
import { Locator, Page, expect } from '@playwright/test';

export class MainContentComponent {
  readonly content: Locator;
  private readonly waitUtils = new WaitUtils();

  constructor(page: Page) {
    this.content = page.locator('#main-content');
  }

  async checkIsVisible(): Promise<void> {
    await this.waitUtils.waitForLocatorVisibility(this.content, { visibility: true });
    await expect(this.content).toBeVisible();
  }
}
