import { expect, test } from '@playwright/test';

test('anonymous visitors are redirected to sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Model Monitor' })).toBeVisible();
});

test('denied state does not expose protected content', async ({ page }) => {
  await page.goto('/denied');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByText('This Google account is not authorized')).toBeVisible();
});

test('health reports the application and PostgreSQL service', async ({ request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { data: { application: string; database: string }; requestId: string };
  expect(body.data).toEqual({ application: 'ok', database: 'ok' });
  expect(body.requestId).not.toBe('');
});
