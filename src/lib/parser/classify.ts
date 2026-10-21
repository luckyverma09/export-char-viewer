import { kindForFile } from '../media';
import type { MediaKind, MediaRef, MessageType, SystemEvent } from '../types';

/** Invisible direction marks WhatsApp (especially iOS) sprinkles into exports. */
export const DIR_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function stripMarks(s: string): string {
  return s.replace(DIR_MARKS, '');
}

/**
 * Known (English) system/group event texts. Patterns with an actor capture the
 * actor in group 1; an actor containing ": " means the line is really
 * "Sender: text", so the match is rejected (see `matchSystem`).
 */
const SYSTEM_PATTERNS: Array<[RegExp, SystemEvent]> = [
  [/^Messages and calls are end-to-end encrypted/i, 'encryption'],
  [/^Messages to this (?:group|chat) are now secured with end-to-end encryption/i, 'encryption'],
  [/^Your security code with (.+?) changed/i, 'security_code'],
  [/^(.+?) created (?:the )?group\b/i, 'group_created'],
  [/^(.+?) created this group\b/i, 'group_created'],
  [/^(.+?) added (.+)$/i, 'member_added'],
  [/^(.+?) removed (.+)$/i, 'member_removed'],
  [/^(.+?) left$/i, 'member_left'],
  [/^(.+?) joined using (?:this|an?) (?:group'?s )?invite link/i, 'member_joined'],
  [/^(.+?) joined from the community/i, 'member_joined'],
  [/^(.+?) joined$/i, 'member_joined'],
  [/^(.+?) changed the subject (?:from .+ )?to /i, 'subject_changed'],
  [/^(.+?) changed the group name/i, 'subject_changed'],
  [/^(.+?) changed (?:this|the) group'?s? icon/i, 'icon_changed'],
  [/^(.+?) (?:deleted|removed) this group'?s icon/i, 'icon_changed'],
  [/^(.+?) changed the group description/i, 'description_changed'],
  [/^(.+?) (?:deleted|removed) the group description/i, 'description_changed'],
  [/^(.+?) changed (?:their|his|her) phone number/i, 'number_changed'],
  [/^(.+?) changed to \+?[\d\s()-]{6,}$/i, 'number_changed'],
  [/^(.+?) changed (?:this group'?s|the group'?s?) settings/i, 'settings_changed'],
  [/^(.+?) (?:turned on|turned off|changed|updated) (?:the )?(?:message timer|disappearing messages)/i, 'disappearing'],
  [/^(.+?) uses? a default timer for disappearing messages/i, 'disappearing'],
  [/^(.+?) (?:is|are) now an admin/i, 'admin'],
  [/^(.+?) (?:is|are) no longer an admin/i, 'admin'],
  [/^(.+?) pinned a message/i, 'pinned'],
  [/^You (?:blocked|unblocked) this (?:contact|business)/i, 'blocked'],
  [/^This (?:chat|business) is (?:with|now using) a/i, 'business'],
  [/^Waiting for this message/i, 'waiting'],
];

export function matchSystem(text: string): SystemEvent | null {
  const t = stripMarks(text).trim();
  if (!t || t.includes('\n')) return null;
  for (const [re, event] of SYSTEM_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const actor = m[1];
    if (actor !== undefined && (actor.includes(': ') || actor.length > 80)) continue;
    return event;
  }
  return null;
}

const OMITTED: Array<[RegExp, MediaKind]> = [
  [/^<Media omitted>$/i, 'unknown'],
  [/^image omitted$/i, 'image'],
  [/^video omitted$/i, 'video'],
  [/^video note omitted$/i, 'video'],
  [/^audio omitted$/i, 'audio'],
  [/^voice message omitted$/i, 'voice'],
  [/^sticker omitted$/i, 'sticker'],
  [/^<?Sticker omitted>?$/i, 'sticker'],
  [/^GIF omitted$/i, 'gif'],
  [/^Contact card omitted$/i, 'contact'],
  [/^document omitted$/i, 'document'],
  [/^<View once (?:voice message|photo|video) omitted>$/i, 'unknown'],
];

const DELETED = /^(?:This message was deleted|You deleted this message|This message was deleted by (?:an )?admin.*)\.?$/i;
const EDITED = /\s*<This message was edited>\s*$/;
const CALL = /^(?:Missed (?:voice|video|group voice|group video) call|(?:Voice|Video) call|Silenced (?:voice|video) call)\b/i;

export interface BodyClassification {
  type: MessageType;
  text: string;
  edited: boolean;
  media?: MediaRef;
}

/**
 * Classify the body of a sender message: media placeholders, attached files,
 * deleted placeholders, calls and edited markers. The original text is kept
 * (minus the edited marker, which becomes a flag).
 */
export function classifyBody(body: string): BodyClassification {
  let text = body;
  let edited = false;
  const plain = stripMarks(text);
  if (EDITED.test(plain)) {
    edited = true;
    text = stripMarks(text).replace(EDITED, '');
  }

  const lines = text.split('\n');
  const first = stripMarks(lines[0]).trim();
  const rest = lines.slice(1).join('\n').trim();

  // iOS: "<attached: 00000012-PHOTO-2024-01-01-10-00-00.jpg>"
  const attached = /^<attached: ([^<>]+?)>\s*(.*)$/i.exec(first);
  if (attached) {
    const fileName = attached[1].trim();
    const caption = [attached[2], rest].filter(Boolean).join('\n').trim();
    return {
      type: 'media',
      text: caption,
      edited,
      media: { kind: kindForFile(fileName), fileName, omitted: false, caption: caption || undefined },
    };
  }

  // Android: "IMG-20240101-WA0001.jpg (file attached)" (+ optional caption lines)
  const androidFile = /^(.+?\.[A-Za-z0-9]{1,6}) \(file attached\)\s*(.*)$/i.exec(first);
  if (androidFile) {
    const fileName = androidFile[1].trim();
    const caption = [androidFile[2], rest].filter(Boolean).join('\n').trim();
    return {
      type: 'media',
      text: caption,
      edited,
      media: { kind: kindForFile(fileName), fileName, omitted: false, caption: caption || undefined },
    };
  }

  // iOS document placeholder: "Report.pdf • 3 pages \u200edocument omitted"
  const iosDoc = /^(.+?)(?: • .+?)?\s+document omitted$/i.exec(first);
  if (iosDoc && !rest) {
    return {
      type: 'media',
      text: '',
      edited,
      media: { kind: 'document', fileName: iosDoc[1].trim(), omitted: true },
    };
  }

  for (const [re, kind] of OMITTED) {
    if (re.test(first)) {
      return { type: 'media', text: rest, edited, media: { kind, omitted: true, caption: rest || undefined } };
    }
  }

  if (!rest && DELETED.test(first)) return { type: 'deleted', text: first, edited: false };
  if (!rest && CALL.test(first)) return { type: 'call', text: first, edited };

  return { type: 'text', text, edited };
}
