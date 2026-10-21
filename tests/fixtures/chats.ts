/**
 * Synthetic WhatsApp exports used by tests. All names and messages are invented.
 * NEVER add real conversations to this repository.
 */

export const ANDROID_12H = [
  '12/05/26, 10:28 pm - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.',
  '12/05/26, 10:30 pm - Lucky: Hello',
  '12/05/26, 10:31 pm - Mansi Sharma: Hi! How are you? 😊',
  '12/05/26, 10:32 pm - Lucky: Good. Meeting at 10:30: is that ok?',
  'Second line of the same message',
  '',
  'Fourth line after a blank line',
  '13/05/26, 12:05 am - Mansi Sharma: <Media omitted>',
  '13/05/26, 12:06 am - Lucky: IMG-20260513-WA0001.jpg (file attached)',
  'Look at this view',
  '13/05/26, 12:07 am - Mansi Sharma: This message was deleted',
  '13/05/26, 12:08 am - Lucky: See you tomorrow <This message was edited>',
  '13/05/26, 12:00 pm - Lucky: Noon message',
].join('\n');

export const ANDROID_24H_4Y = [
  '05/12/2026, 22:30 - Mansi: Hi',
  '05/12/2026, 22:31 - Lucky: Hey',
  '13/12/2026, 09:00 - Mansi: Next week',
].join('\n');

export const IOS = [
  '\u200e[12/05/26, 22:30:15] Lucky: \u200eMessages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
  '[12/05/26, 22:30:15] Lucky: Hello',
  '[12/05/26, 22:31:02] Mansi: Hi 👋🏽',
  '\u200e[12/05/26, 22:32:40] Mansi: \u200eimage omitted',
  '\u200e[13/05/26, 08:00:00] Lucky: \u200e<attached: 00000012-PHOTO-2026-05-13-08-00-00.jpg>',
  '[13/05/26, 08:01:00] Lucky: Multi',
  'line',
  '\u200e[13/05/26, 08:02:00] Mansi: \u200eThis message was deleted.',
  '[13/05/26, 08:03:00] Mansi: edited text \u200e<This message was edited>',
  '\u200e[13/05/26, 08:04:00] Lucky: Report.pdf • 3 pages \u200edocument omitted',
].join('\n');

export const IOS_12H = [
  '[5/12/26, 10:30:15 PM] Lucky: Hello',
  '[5/12/26, 10:31:00\u202fPM] Mansi: Hi',
  '[5/13/26, 12:00:00 AM] Lucky: Midnight',
].join('\n');

export const GROUP = [
  '01/03/2025, 09:00 - Asha created group "Trip ✈\ufe0f planning"',
  '01/03/2025, 09:00 - Asha added Ben',
  '01/03/2025, 09:01 - Asha added Chandra Kumar Rao',
  '01/03/2025, 09:02 - Ben: Hi all!',
  '01/03/2025, 09:03 - Chandra Kumar Rao: Hello 🙏',
  '01/03/2025, 09:04 - Asha changed the subject from "Trip: v1" to "Trip ✈\ufe0f planning"',
  '01/03/2025, 09:05 - Asha: Welcome everyone',
  '02/03/2025, 18:00 - Ben left',
  '02/03/2025, 18:01 - Asha: I added a note: check it',
].join('\n');

/** Every day/month value <= 12 and chronological under both readings. */
export const AMBIGUOUS = [
  '01/02/26, 10:00 - Lucky: one',
  '01/02/26, 11:00 - Mansi: two',
  '03/04/26, 12:00 - Lucky: three',
].join('\n');

/** <= 12 values, but only DMY keeps the chat chronological. */
export const AMBIGUOUS_RESOLVABLE = [
  '12/04/26, 10:00 - Lucky: one', // DMY 12 Apr / MDY 4 Dec
  '02/05/26, 11:00 - Mansi: two', // DMY 2 May / MDY 5 Feb (backwards under MDY)
].join('\n');

export function syntheticChat(count: number, senders = ['Lucky', 'Mansi']): string {
  const lines: string[] = [];
  const start = Date.UTC(2024, 0, 1, 8, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(start + i * 7 * 60_000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(d.getUTCFullYear()).slice(2);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    lines.push(`${dd}/${mm}/${yy}, ${hh}:${mi} - ${senders[i % senders.length]}: Message number ${i} ${i % 50 === 0 ? 'needle' : 'hay'}`);
  }
  return lines.join('\n');
}
