/**
 * Core domain types shared by the parser, importer, database and UI.
 *
 * TIMESTAMP CONVENTION ("floating local time"):
 * WhatsApp exports contain wall-clock times without a timezone. To avoid any
 * accidental shift caused by the browser's timezone or DST rules, every `ts`
 * value is the wall-clock time encoded as if it were UTC:
 *   ts = Date.UTC(year, month - 1, day, hour, minute, second)
 * All formatting therefore uses `timeZone: 'UTC'`. The exact original text is
 * also kept in `tsText`.
 */

export type ConversationType = 'individual' | 'group';

export type MessageType =
  | 'text'
  | 'system'
  | 'media'
  | 'deleted'
  | 'call'
  /** Text that could not be attributed to a recognised message header. */
  | 'unparsed';

export type MediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'gif'
  | 'contact'
  | 'unknown';

export type DateOrder = 'DMY' | 'MDY' | 'YMD';

export type SourceFormat = 'android' | 'ios' | 'mixed' | 'unknown';

export type SystemEvent =
  | 'encryption'
  | 'group_created'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'member_joined'
  | 'subject_changed'
  | 'icon_changed'
  | 'description_changed'
  | 'number_changed'
  | 'settings_changed'
  | 'disappearing'
  | 'admin'
  | 'security_code'
  | 'pinned'
  | 'blocked'
  | 'business'
  | 'waiting'
  | 'other';

export interface MediaRef {
  kind: MediaKind;
  /** File name referenced by the export, when present. */
  fileName?: string;
  /** True when the export explicitly says the media was omitted. */
  omitted: boolean;
  /** Caption text that accompanied the media, if any. */
  caption?: string;
}

export interface ParseWarning {
  /** 1-based line number in the source text. */
  line: number;
  code:
    | 'orphan_text'
    | 'invalid_date'
    | 'missing_sender'
    | 'out_of_order'
    | 'encoding'
    | 'date_order'
    | 'truncated';
  message: string;
  /** Short excerpt of the problematic source (shown only in the UI). */
  excerpt?: string;
}

/** A message as produced by the parser, before it is stored. */
export interface ParsedMessage {
  /** 0-based position in the source export. */
  order: number;
  /** 1-based line number of the header line. */
  line: number;
  ts: number;
  tsText: string;
  /** Raw sender name as written in the export, or null for system/unknown. */
  sender: string | null;
  text: string;
  type: MessageType;
  edited: boolean;
  media?: MediaRef;
  systemEvent?: SystemEvent;
  warnings?: string[];
}

export interface SenderInfo {
  name: string;
  count: number;
  firstOrder: number;
}

export interface ParseResult {
  messages: ParsedMessage[];
  senders: SenderInfo[];
  format: SourceFormat;
  dateOrder: DateOrder;
  /** Date orders consistent with every header in the file. */
  dateOrderCandidates: DateOrder[];
  /** False when the user must confirm how dates should be read. */
  dateOrderConfident: boolean;
  hour12: boolean;
  warnings: ParseWarning[];
  /** True if group-only system events were found (created group, added, ...). */
  groupEvents: boolean;
  lineCount: number;
  /** Sample date strings (as written) to help the user pick a date order. */
  dateSamples: string[];
}

// ---------------------------------------------------------------------------
// Stored records (IndexedDB)
// ---------------------------------------------------------------------------

export type ImportStatus = 'importing' | 'complete';

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  participantIds: string[];
  /** Participant the user identified as themself; null = "none of these". */
  selfParticipantId: string | null;
  importedAt: number;
  sourceFormat: SourceFormat;
  sourceName: string;
  sourceKind: 'txt' | 'zip' | 'paste' | 'backup';
  dateOrder: DateOrder;
  hour12: boolean;
  messageCount: number;
  attachmentCount: number;
  earliestTs: number | null;
  latestTs: number | null;
  status: ImportStatus;
  /** Content fingerprint used to detect re-imports of the same export. */
  fingerprint: string;
  lastMessagePreview: string;
  lastMessageSenderId: string | null;
  warningCount: number;
  /** Free-form display metadata; reserved for future use. */
  display?: { color?: number };
}

export interface Participant {
  id: string;
  conversationId: string;
  /** Sender name exactly as it appears in the export. */
  originalName: string;
  /** Additional raw sender names merged into this participant. */
  aliases: string[];
  displayName: string;
  normalizedName: string;
  messageCount: number;
  color: number;
}

export interface Message {
  /** `${conversationId}:${order}` */
  id: string;
  conversationId: string;
  order: number;
  ts: number;
  tsText: string;
  senderId: string | null;
  text: string;
  type: MessageType;
  edited?: boolean;
  media?: MediaRef & { attachmentId?: string };
  systemEvent?: SystemEvent;
  /** Reserved: WhatsApp exports do not currently contain reply context. */
  quote?: { messageId?: string; text: string };
  /** Raw sender name from the export (kept for fidelity / re-export). */
  rawSender?: string | null;
  warnings?: string[];
}

export interface Attachment {
  id: string;
  conversationId: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  /** 'available' when the bytes are stored in the `blobs` table. */
  status: 'available' | 'missing';
}

export interface StoredBlob {
  id: string; // same as Attachment.id
  conversationId: string;
  data: ArrayBuffer;
}
