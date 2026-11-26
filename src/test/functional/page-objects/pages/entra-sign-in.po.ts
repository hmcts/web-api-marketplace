import { Locator, Page, expect } from '@playwright/test';

/**
 * Microsoft Entra External ID's own sign-in pages (<tenant>.ciamlogin.com), where the app sends a
 * browser to sign in outside local runs and the stack journeys. Email first, then password, then
 * the "Stay signed in?" prompt where Entra shows it.
 */
export class EntraSignInPage {
  public readonly email: Locator;
  public readonly next: Locator;
  public readonly password: Locator;
  public readonly signInButton: Locator;
  public readonly staySignedIn: Locator;
  public readonly doNotStaySignedIn: Locator;

  constructor(public readonly page: Page) {
    this.email = page.getByRole('textbox', { name: 'Email address' });
    this.next = page.getByRole('button', { name: 'Next' });
    this.password = page.locator('input[type="password"]');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.staySignedIn = page.getByText('Stay signed in?');
    this.doNotStaySignedIn = page.getByRole('button', { name: 'No' });
  }

  public async signIn(email: string, password: string): Promise<void> {
    await expect(this.email).toBeVisible();
    await this.email.fill(email);
    await this.next.click();
    await expect(this.password).toBeVisible();
    await this.password.fill(password);
    await this.signInButton.click();

    // Entra's pages have no h1, so the first one seen is the app's, back from sign in
    await expect(this.staySignedIn.or(this.page.locator('h1')).first()).toBeVisible({ timeout: 15_000 });
    if (await this.staySignedIn.isVisible()) {
      await this.doNotStaySignedIn.click();
    }
  }
}
