export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
  hadBom: boolean;
  /** Number of U+FFFD replacement characters produced while decoding. */
  replacements: number;
}

function countReplacements(s: string): number {
  let n = 0;
  for (let i = s.indexOf('\ufffd'); i !== -1; i = s.indexOf('\ufffd', i + 1)) n++;
  return n;
}

/**
 * Decode exported chat bytes. Handles UTF-8 (with or without BOM) and UTF-16
 * with BOM. If UTF-8 decoding produces many replacement characters, a legacy
 * single-byte decode is tried and whichever loses less text is used.
 */
export function decodeChatBytes(bytes: Uint8Array): DecodedText {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
    return { text, encoding: 'utf-16le', hadBom: true, replacements: countReplacements(text) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
    return { text, encoding: 'utf-16be', hadBom: true, replacements: countReplacements(text) };
  }
  const hadBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hadBom ? bytes.subarray(3) : bytes;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(body);
  const replacements = countReplacements(text);
  if (replacements > 0 && replacements > text.length / 200) {
    try {
      const legacy = new TextDecoder('windows-1252').decode(body);
      return { text: legacy, encoding: 'windows-1252', hadBom, replacements };
    } catch {
      // windows-1252 not supported: fall through with the UTF-8 result.
    }
  }
  return { text, encoding: 'utf-8', hadBom, replacements };
}
