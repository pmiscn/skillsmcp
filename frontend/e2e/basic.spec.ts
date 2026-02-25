import { test, expect } from '@playwright/test';

test('basic workflow: upload and view book', async ({ page }) => {
  await page.goto('/');
  
  const uploadLink = page.getByRole('link', { name: /upload/i });
  if (await uploadLink.isVisible()) {
    await uploadLink.click();
  } else {
    await page.goto('/upload');
  }

  await expect(page.getByText(/drag and drop/i)).toBeVisible();
  
  const libraryLink = page.getByRole('link', { name: /library|books/i });
  if (await libraryLink.isVisible()) {
    await libraryLink.click();
  } else {
    await page.goto('/books');
  }
  
  await expect(page.locator('h1')).toContainText(/Library|Books/);
});
