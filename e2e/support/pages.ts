import { expect, type Locator, type Page } from '@playwright/test';
import { t } from './i18n';

/**
 * Page objects of the parts many tests go through. Locators are accessible names (labels, roles)
 * taken from the translations, never CSS classes.
 */

/** Header, navigation and account menu, present on every page. */
export class Shell {
  constructor(readonly page: Page) {}

  accountButton(username: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`^${escape(t('auth.account.menu', { name: username }))}`),
    });
  }

  signInLink(): Locator {
    return this.page.getByRole('link', { name: t('auth.account.signIn'), exact: true }).first();
  }

  nav(): Locator {
    return this.page.getByRole('navigation', { name: t('app.mainNavigation') });
  }

  /** The notice required by Supercell's Fan Content Policy (footer of every page). */
  fanContentNotice(): Locator {
    const text = t('app.fanContent').replace(/<[^>]+>/g, '');
    return this.page.getByRole('contentinfo').filter({ hasText: text });
  }

  async openAccountMenu(username: string): Promise<Locator> {
    await this.accountButton(username).click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async signOut(username: string): Promise<void> {
    const menu = await this.openAccountMenu(username);
    await menu.getByRole('menuitem', { name: t('auth.account.signOut') }).click();
    await expect(this.accountButton(username)).toBeHidden();
  }
}

export class SignInPage {
  constructor(readonly page: Page) {}

  readonly identifier = () => this.page.getByLabel(t('auth.fields.identifier'));
  readonly password = () => this.page.getByLabel(t('auth.fields.password'), { exact: true });
  readonly submit = () =>
    this.page.getByRole('button', { name: t('auth.signIn.submit'), exact: true });
  readonly alert = () => this.page.getByRole('alert');

  async goto(returnUrl?: string): Promise<void> {
    await this.page.goto(
      returnUrl ? `/sign-in?returnUrl=${encodeURIComponent(returnUrl)}` : '/sign-in',
    );
    await expect(this.page.getByRole('heading', { name: t('auth.signIn.title') })).toBeVisible();
  }

  async signIn(identifier: string, password: string): Promise<void> {
    await this.identifier().fill(identifier);
    await this.password().fill(password);
    await this.submit().click();
  }
}

export class SignUpPage {
  constructor(readonly page: Page) {}

  readonly email = () => this.page.getByLabel(t('auth.fields.email'));
  readonly username = () => this.page.getByLabel(t('auth.fields.username'));
  readonly password = () => this.page.getByLabel(t('auth.fields.password'), { exact: true });
  readonly repeatPassword = () => this.page.getByLabel(t('auth.fields.repeatPassword'));
  readonly submit = () =>
    this.page.getByRole('button', { name: t('auth.signUp.submit'), exact: true });

  async goto(): Promise<void> {
    await this.page.goto('/sign-up');
    await expect(this.page.getByRole('heading', { name: t('auth.signUp.title') })).toBeVisible();
  }

  async fill(values: {
    email: string;
    username: string;
    password: string;
    repeatPassword?: string;
  }): Promise<void> {
    await this.email().fill(values.email);
    await this.username().fill(values.username);
    await this.password().fill(values.password);
    await this.repeatPassword().fill(values.repeatPassword ?? values.password);
  }
}

export class ProfilePage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/profile');
    await expect(
      this.page.getByRole('heading', { name: t('profile.account.title'), exact: true }),
    ).toBeVisible();
  }

  section(titleKey: string): Locator {
    return this.page.getByRole('region', { name: t(titleKey), exact: true });
  }

  readonly playerSection = () => this.section('profile.player.title');
  readonly passwordSection = () => this.section('profile.password.title');
  readonly accountSection = () => this.section('profile.account.title');

  async linkAccount(tag: string, token: string): Promise<void> {
    const section = this.playerSection();
    await section.getByLabel(t('auth.fields.playerTag')).fill(tag);
    await section.getByLabel(t('profile.player.token')).fill(token);
    await section.getByRole('button', { name: t('profile.player.verify') }).click();
  }

  async changePassword(current: string, next: string, repeat = next): Promise<void> {
    const section = this.passwordSection();
    await section.getByLabel(t('auth.fields.currentPassword')).fill(current);
    await section.getByLabel(t('auth.fields.newPassword')).fill(next);
    await section.getByLabel(t('auth.fields.repeatPassword')).fill(repeat);
    await section.getByRole('button', { name: t('profile.password.submit') }).click();
  }
}

/**
 * Checks that the field labelled `label` reports `message` the way assistive technologies get it:
 * the error is part of the input's accessible description (Material links its `mat-error` with
 * `aria-describedby`). A hint of the field may come before or after it.
 */
export async function expectFieldError(
  scope: Page | Locator,
  label: string,
  message: string,
): Promise<void> {
  const field = scope.getByLabel(label, { exact: true });
  await expect(field).toHaveAccessibleDescription(new RegExp(`(^|\\s)${escape(message)}(\\s|$)`));
}

/**
 * The text of an element as assistive technologies read it (its accessibility snapshot): the words
 * of separate elements are separated, decorative parts (`aria-hidden`) left out. A summary card
 * reads "Victories 2 67% of total", where its text content is "Victories267% of total".
 */
export async function accessibleText(locator: Locator): Promise<string> {
  const [first = ''] = (await locator.ariaSnapshot()).split('\n');
  // `- group "Victories": Victories 2 67% of total` (quoted when the text holds a colon).
  const text = first.replace(/^- [\w-]+(?: "(?:[^"\\]|\\.)*")?: ?/, '');
  return text.replace(/^"(.*)"$/, '$1').trim();
}

export function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
