import { expect, type Page } from '@playwright/test';

/** Synthetic export - invented people and messages only. */
export const SAMPLE_CHAT = [
  '12/05/26, 10:28 pm - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
  '12/05/26, 10:30 pm - Lucky: Hello there',
  '12/05/26, 10:31 pm - Mansi: Hi Lucky! 😊',
  '12/05/26, 10:32 pm - Lucky: Meeting at 10:30: ok?',
  'Second line',
  '13/05/26, 9:00 am - Mansi: <Media omitted>',
  '13/05/26, 9:01 am - Mansi: Banana bread recipe is great',
  '13/05/26, 9:02 am - Lucky: This message was deleted',
].join('\n');

export function syntheticChat(count: number): string {
  const lines: string[] = [];
  const start = Date.UTC(2024, 0, 1, 8, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(start + i * 7 * 60_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const who = i % 2 ? 'Mansi' : 'Lucky';
    lines.push(`${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} - ${who}: Message ${i}${i % 1000 === 0 ? ' needle' : ''}`);
  }
  return lines.join('\n');
}

export async function importChat(page: Page, text: string, fileName: string, me: string) {
  await page.getByRole('button', { name: 'Import WhatsApp chat' }).first().click();
  await page.getByLabel('WhatsApp export file').setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') });
  const who = page.getByRole('radiogroup', { name: 'Who are you in this conversation?' });
  await expect(who).toBeVisible({ timeout: 30_000 });
  await who.getByText(me, { exact: true }).click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Import chat' }).click();
  await expect(page.getByText('Read-only archive')).toBeVisible({ timeout: 60_000 });
}

export function bubble(page: Page, text: string) {
  return page.locator('[data-side]', { has: page.getByText(text, { exact: true }) }).last();
}
