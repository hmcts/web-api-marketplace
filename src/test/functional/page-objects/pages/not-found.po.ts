import { expect } from '@playwright/test';

import { Base } from '../base';

export class NotFoundPage extends Base {
  async goto(lng?: string): Promise<void> {
    if (lng) {
      await this.page.goto(`/?lng=${lng}`);
    } else {
      await this.page.goto('/');
    }
  }

  async expectLanguageLinkToContainText(language: string): Promise<void> {
    await expect(this.languageLink).toContainText(language);
  }

  async expectHeadingToContainText(text: string): Promise<void> {
    await expect(this.heading).toContainText(text);
  }

  async expectMainContentToBePopulated(): Promise<void> {
    await expect(this.mainContent).toContainText(/\w+/);
  }
}
