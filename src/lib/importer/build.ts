import { colorIndexFor } from '../avatar';
import { createId, messageId } from '../ids';
import { mimeForFile } from '../media';
import { previewText } from '../preview';
import type { Attachment, Conversation, ConversationType, Message, Participant } from '../types';
import type { ImportDraft } from './draft';

export interface ParticipantDecision {
  /** Raw sender name from the export. */
  raw: string;
  displayName: string;
  /** Raw name of another sender this one is the same person as, or null. */
  mergeInto: string | null;
}

export interface ImportDecisions {
  title: string;
  type: ConversationType;
  participants: ParticipantDecision[];
  /** Raw sender name of the user ("who are you?"), or null for none. */
  selfRaw: string | null;
}

export interface ImportRecords {
  conversation: Conversation;
  participants: Participant[];
  messages: Message[];
  /** Attachments to extract and store, with their archive path. */
  attachments: Array<Attachment & { archivePath: string }>;
}

export function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[\s\u00a0\u202f]+/g, ' ').trim();
}

/** Follow merge chains (A -> B -> C) to the final raw name, ignoring cycles. */
export function resolveMerges(decisions: ParticipantDecision[]): Map<string, string> {
  const byRaw = new Map(decisions.map((d) => [d.raw, d]));
  const result = new Map<string, string>();
  for (const d of decisions) {
    let cur = d;
    const seen = new Set<string>([cur.raw]);
    while (cur.mergeInto && byRaw.has(cur.mergeInto) && !seen.has(cur.mergeInto)) {
      cur = byRaw.get(cur.mergeInto)!;
      seen.add(cur.raw);
    }
    result.set(d.raw, cur.raw);
  }
  return result;
}

export function defaultDecisions(draft: ImportDraft): ImportDecisions {
  return {
    title: draft.suggestedTitle,
    type: draft.suggestedType,
    participants: draft.parse.senders.map((s) => ({ raw: s.name, displayName: s.name, mergeInto: null })),
    selfRaw: null,
  };
}

/**
 * Turn a parsed draft plus the user's choices into database records.
 * Pure function: no I/O, so it is easy to test and the preview can use it too.
 */
export function buildRecords(
  draft: ImportDraft,
  decisions: ImportDecisions,
  options: { conversationId?: string; importedAt?: number } = {},
): ImportRecords {
  const conversationId = options.conversationId ?? createId();
  const canonical = resolveMerges(decisions.participants);
  const decisionByRaw = new Map(decisions.participants.map((d) => [d.raw, d]));

  // One participant per canonical sender, in order of first appearance.
  const participantByRaw = new Map<string, Participant>();
  const participants: Participant[] = [];
  for (const s of draft.parse.senders) {
    const root = canonical.get(s.name) ?? s.name;
    let p = participantByRaw.get(root);
    if (!p) {
      const d = decisionByRaw.get(root);
      const displayName = (d?.displayName || root).trim() || root;
      p = {
        id: createId(),
        conversationId,
        originalName: root,
        aliases: [],
        displayName,
        normalizedName: normalizeName(displayName),
        messageCount: 0,
        color: colorIndexFor(root),
      };
      participantByRaw.set(root, p);
      participants.push(p);
    }
    if (s.name !== root) {
      p.aliases.push(s.name);
      participantByRaw.set(s.name, p);
    }
  }

  const messages: Message[] = [];
  const attachments: ImportRecords['attachments'] = [];
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const pm of draft.parse.messages) {
    const id = messageId(conversationId, pm.order);
    const participant = pm.sender ? participantByRaw.get(pm.sender) : undefined;
    if (participant) participant.messageCount++;
    const msg: Message = {
      id,
      conversationId,
      order: pm.order,
      ts: pm.ts,
      tsText: pm.tsText,
      senderId: participant?.id ?? null,
      text: pm.text,
      type: pm.type,
      rawSender: pm.sender,
    };
    if (pm.edited) msg.edited = true;
    if (pm.systemEvent) msg.systemEvent = pm.systemEvent;
    if (pm.warnings?.length) msg.warnings = pm.warnings;
    if (pm.media) {
      msg.media = { ...pm.media };
      const match = pm.media.fileName && !pm.media.omitted ? draft.matchedFiles[pm.media.fileName] : undefined;
      if (match && pm.media.fileName) {
        const attachmentId = createId();
        msg.media.attachmentId = attachmentId;
        attachments.push({
          id: attachmentId,
          conversationId,
          messageId: id,
          fileName: pm.media.fileName,
          mimeType: mimeForFile(pm.media.fileName),
          kind: pm.media.kind,
          size: match.size,
          status: 'available',
          archivePath: match.path,
        });
      }
    }
    if (pm.type !== 'unparsed' && pm.tsText) {
      earliest = earliest === null ? pm.ts : Math.min(earliest, pm.ts);
      latest = latest === null ? pm.ts : Math.max(latest, pm.ts);
    }
    messages.push(msg);
  }

  const selfRoot = decisions.selfRaw ? (canonical.get(decisions.selfRaw) ?? decisions.selfRaw) : null;
  const self = selfRoot ? participantByRaw.get(selfRoot) : undefined;
  const last = [...messages].reverse().find((m) => m.type !== 'unparsed') ?? messages[messages.length - 1];

  const conversation: Conversation = {
    id: conversationId,
    title: decisions.title.trim() || draft.suggestedTitle,
    type: decisions.type,
    participantIds: participants.map((p) => p.id),
    selfParticipantId: self?.id ?? null,
    importedAt: options.importedAt ?? Date.now(),
    sourceFormat: draft.parse.format,
    sourceName: draft.source.name,
    sourceKind: draft.source.kind,
    dateOrder: draft.parse.dateOrder,
    hour12: draft.parse.hour12,
    messageCount: messages.length,
    attachmentCount: attachments.length,
    earliestTs: earliest,
    latestTs: latest,
    status: 'importing',
    fingerprint: draft.fingerprint,
    lastMessagePreview: last ? previewText(last) : '',
    lastMessageSenderId: last?.senderId ?? null,
    warningCount: draft.parse.warnings.length,
  };

  return { conversation, participants, messages, attachments };
}
