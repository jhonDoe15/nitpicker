import { test as base } from '@playwright/test';

export const test = base.extend<{ signedIn: boolean }>({
  signedIn: async ({}, use) => {
    await use(true);
  },
});
