import { Locator, Page, expect } from '@playwright/test';

/**
 * Microsoft Entra External ID's own sign-in pages (<tenant>.ciamlogin.com), where the app sends a
 * browser to sign in outside local runs and the stack journeys. Email first, then password.
 */
export class EntraSignInPage {
  public readonly email: Locator;
  public readonly next: Locator;
  public readonly password: Locator;
  public readonly signInButton: Locator;

  constructor(public readonly page: Page) {
    this.email = page.getByRole('textbox', { name: 'Email address' });
    this.next = page.getByRole('button', { name: 'Next' });
    this.password = page.locator('input[type="password"]');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
  }

  public async signIn(email: string, password: string): Promise<void> {
    await expect(this.email).toBeVisible();
    await this.email.fill(email);
    await this.next.click();
    await expect(this.password).toBeVisible();
    await this.password.fill(password);
    await this.signInButton.click();
  }
}
