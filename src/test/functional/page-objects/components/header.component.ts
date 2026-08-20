import { WaitUtils } from '@hmcts/playwright-common';
import { Locator, Page, expect } from '@playwright/test';

export class HeaderComponent {
  readonly header: Locator;
  readonly navigationLinks: Locator;
  private readonly waitUtils = new WaitUtils();

  constructor(page: Page) {
    this.header = page.locator('header');
    this.navigationLinks = page.locator('.govuk-service-navigation__link');
  }

  async checkIsVisible(): Promise<void> {
    await this.waitUtils.waitForLocatorVisibility(this.header, { visibility: true });
    await expect(this.header).toBeVisible();
  }

  async expectNavigationLink(text: string): Promise<void> {
    await expect(this.navigationLinks.filter({ hasText: text })).toBeVisible();
  }
}
