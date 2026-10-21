import { expect, test } from '@playwright/test';
import { bubble, importChat, SAMPLE_CHAT } from './helpers';

test('desktop shows a two-pane layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Select a chat on the left', { exact: false })).toBeVisible();
  await importChat(page, SAMPLE_CHAT, 'WhatsApp Chat with Lucky.txt', 'Mansi');
  // List and chat are visible side by side.
  await expect(page.getByRole('list', { name: 'Chats' })).toBeVisible();
  await expect(bubble(page, 'Hi Lucky! 😊')).toHaveAttribute('data-side', 'out');
});
