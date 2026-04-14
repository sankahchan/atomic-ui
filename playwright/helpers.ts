import { type Page } from '@playwright/test';

export const smokeAdminEmail = 'smoke-admin@example.com';
export const smokeAdminPassword = 'Admin123!';
export const smokePortalEmail = 'smoke-portal@example.com';
export const smokePortalPassword = 'Portal123!';
export const smokeVisualNowIso = '2026-04-14T03:00:00.000Z';

export async function login(page: Page, email = smokeAdminEmail, password = smokeAdminPassword) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

export async function freezeBrowserTime(page: Page, isoString = smokeVisualNowIso) {
  const fixedTimestamp = new Date(isoString).getTime();
  await page.addInitScript(({ now }) => {
    const RealDate = Date;

    class FrozenDate extends RealDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) {
          super(now);
          return;
        }
        super(...args);
      }

      static now() {
        return now;
      }
    }

    Object.defineProperty(FrozenDate, 'parse', {
      value: RealDate.parse,
    });
    Object.defineProperty(FrozenDate, 'UTC', {
      value: RealDate.UTC,
    });
    Object.setPrototypeOf(FrozenDate, RealDate);

    // @ts-expect-error Intentional global override for deterministic screenshots.
    window.Date = FrozenDate;
  }, { now: fixedTimestamp });
}

export async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript(({ nextTheme }) => {
    window.localStorage.setItem('theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
  }, { nextTheme: theme });
}

export async function stabilizeVisuals(page: Page) {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html {
        scroll-behavior: auto !important;
      }
    `,
  });
}
