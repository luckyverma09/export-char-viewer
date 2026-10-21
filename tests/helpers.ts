import { strToU8, zipSync, type Zippable } from 'fflate';
import { ChatssDB, setDb } from '../src/lib/db/db';
import { buildRecords, defaultDecisions, type ImportDecisions } from '../src/lib/importer/build';
import { prepareFromBytes, prepareFromText } from '../src/lib/importer/draft';
import { saveImport } from '../src/lib/db/repo';
import { extractEntries } from '../src/lib/zip';

let n = 0;

/** Fresh, isolated IndexedDB (fake-indexeddb) for each test. */
export function freshDb(): ChatssDB {
  const db = new ChatssDB(`chatss-test-${Date.now()}-${n++}`);
  setDb(db);
  return db;
}

export function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const z: Zippable = {};
  for (const [k, v] of Object.entries(files)) z[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(z);
}

/** Parse + save a chat the same way the wizard does. */
export async function importText(text: string, tweak?: (d: ImportDecisions) => ImportDecisions) {
  const draft = prepareFromText(text);
  let decisions = defaultDecisions(draft);
  decisions.selfRaw = draft.parse.senders[0]?.name ?? null;
  if (tweak) decisions = tweak(decisions);
  const records = buildRecords(draft, decisions);
  const id = await saveImport(records, null);
  return { id, draft, records };
}

export async function importZip(zip: Uint8Array, name = 'WhatsApp Chat with Lucky.zip') {
  const draft = prepareFromBytes(zip, name);
  const decisions = defaultDecisions(draft);
  decisions.selfRaw = draft.parse.senders[0]?.name ?? null;
  const records = buildRecords(draft, decisions);
  const id = await saveImport(records, async (paths) => extractEntries(zip, paths));
  return { id, draft, records };
}
