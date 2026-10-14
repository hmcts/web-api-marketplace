import { expect } from '@playwright/test';

import { Base } from '../base';

export class HomePage extends Base {
  private readonly backLink = this.page.locator('a.govuk-back-link');

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async expectHeadingToContainText(text: string): Promise<void> {
    await expect(this.heading).toContainText(text);
  }

  async expectMainContentToBePopulated(): Promise<void> {
    await expect(this.mainContent).toContainText(/\w+/);
  }

  async expectBackLinkNotVisible(): Promise<void> {
    await expect(this.backLink).not.toBeVisible();
  }
}
