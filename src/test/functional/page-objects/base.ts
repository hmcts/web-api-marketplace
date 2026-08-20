import { Locator, Page, expect } from '@playwright/test';

import { FooterComponent } from './components/footer.component';
import { HeaderComponent } from './components/header.component';
import { MainContentComponent } from './components/main-content.component';
import { TitleComponent } from './components/title.component';

export abstract class Base {
  public readonly footer: Locator;
  public readonly footerComponent: FooterComponent;
  public readonly header: Locator;
  public readonly headerComponent: HeaderComponent;
  public readonly heading: Locator;
  public readonly languageLink: Locator;
  public readonly mainContent: Locator;
  public readonly mainContentComponent: MainContentComponent;
  public readonly phaseBanner: Locator;
  public readonly title: Locator;
  public readonly titleComponent: TitleComponent;

  constructor(public readonly page: Page) {
    this.footerComponent = new FooterComponent(page);
    this.headerComponent = new HeaderComponent(page);
    this.mainContentComponent = new MainContentComponent(page);
    this.titleComponent = new TitleComponent(page);

    this.footer = this.footerComponent.footer;
    this.header = this.headerComponent.header;
    this.heading = page.locator('h1').first();
    this.languageLink = page.locator('a.govuk-link.apim-language');
    this.mainContent = this.mainContentComponent.content;
    this.phaseBanner = page.locator('div.govuk-phase-banner');
    this.title = this.titleComponent.title;
  }

  async expectVisibleElements(): Promise<void> {
    await this.headerComponent.checkIsVisible();
    await this.titleComponent.checkIsVisible();
    await expect(this.phaseBanner).toBeVisible();
    await expect(this.languageLink).toBeVisible();
    await expect(this.heading).toBeVisible();
    await this.mainContentComponent.checkIsVisible();
    await this.footerComponent.checkIsVisible();
  }
}
