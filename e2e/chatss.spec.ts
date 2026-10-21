import { expect, test } from '@playwright/test';
import { bubble, importChat, SAMPLE_CHAT, syntheticChat } from './helpers';

test.describe('Chatss on an Android-sized screen', () => {
  test('import, alignment, persistence, perspective switch and search', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));

    await page.goto('/');
    await expect(page.getByText('Welcome to Chatss')).toBeVisible();
    await importChat(page, SAMPLE_CHAT, 'WhatsApp Chat with Lucky.txt', 'Mansi');

    // Mansi is "me": her messages are on the right.
    await expect(bubble(page, 'Hi Lucky! 😊')).toHaveAttribute('data-side', 'out');
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'in');
    await expect(page.getByText('Media not included in the export')).toBeVisible();

    // Android Back right after importing returns to the chat list.
    await page.goBack();
    await page.getByRole('list', { name: 'Chats' }).getByText('Lucky', { exact: true }).click();
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'in');

    // Survives a reload (IndexedDB) and reopens the last chat.
    await page.reload();
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'in');

    // Switch perspective without re-importing.
    await page.getByRole('button', { name: 'Chat options' }).click();
    await page.getByRole('menuitem', { name: 'Change who I am' }).click();
    await page.getByRole('radio', { name: /Lucky/ }).click();
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'out');
    await expect(bubble(page, 'Hi Lucky! 😊')).toHaveAttribute('data-side', 'in');

    // In-chat search with result count and highlight.
    await page.getByRole('button', { name: 'Search in chat' }).click();
    await page.getByLabel('Search in this chat').fill('banana');
    await expect(page.getByText('1 of 1')).toBeVisible();
    await expect(page.locator('mark.hl')).toHaveText('Banana');

    // Back to the list (Android back button behaviour).
    await page.getByLabel('Search in this chat').press('Escape');
    await page.goBack();
    await expect(page.getByRole('list', { name: 'Chats' }).getByText('Lucky', { exact: true })).toBeVisible();

    // Privacy: no request ever leaves the local origin.
    const origin = new URL(page.url()).origin;
    expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([]);
  });

  test('works offline after the first visit', async ({ page, context }) => {
    await page.goto('/');
    // Wait until the service worker is installed and active (app shell cached).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await importChat(page, SAMPLE_CHAT, 'WhatsApp Chat with Lucky.txt', 'Lucky');

    await context.setOffline(true);
    await page.reload();
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'out');

    // Search and perspective switching still work offline.
    await page.getByRole('button', { name: 'Search in chat' }).click();
    await page.getByLabel('Search in this chat').fill('meeting');
    await expect(page.getByText('1 of 1')).toBeVisible();
    await page.getByRole('button', { name: 'Close search' }).click();
    await page.getByRole('button', { name: 'Chat options' }).click();
    await page.getByRole('menuitem', { name: 'Change who I am' }).click();
    await page.getByRole('radio', { name: /Mansi/ }).click();
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'in');

    // Reload while still offline.
    await page.reload();
    await expect(bubble(page, 'Hello there')).toHaveAttribute('data-side', 'in');
    await context.setOffline(false);
  });

  test('large conversations stay virtualised', async ({ page }) => {
    await page.goto('/');
    await importChat(page, syntheticChat(50_000), 'WhatsApp Chat with Big.txt', 'Lucky');
    await expect(page.getByText('Message 49999', { exact: true })).toBeVisible();
    const rendered = await page.locator('[data-message-id]').count();
    expect(rendered).toBeLessThan(400);

    await page.getByRole('button', { name: 'Search in chat' }).click();
    await page.getByLabel('Search in this chat').fill('needle');
    await expect(page.getByText('50 of 50')).toBeVisible();
    await page.getByRole('button', { name: 'Previous (older) result' }).click();
    await expect(page.getByText('49 of 50')).toBeVisible();
    await expect(page.getByText('Message 48000 needle')).toBeVisible();
    expect(await page.locator('[data-message-id]').count()).toBeLessThan(400);
  });

  test('rejects a file that is not a WhatsApp export', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import WhatsApp chat' }).first().click();
    await page.getByLabel('WhatsApp export file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('just some notes') });
    await expect(page.getByRole('alert')).toContainText('does not look like a WhatsApp chat export');
  });
});
