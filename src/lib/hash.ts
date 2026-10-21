/**
 * Small non-cryptographic 64-bit hash (two FNV-1a lanes) used only to detect
 * repeated imports of the same export. Not used for any security purpose.
 */
export class Fingerprint {
  private h1 = 0x811c9dc5;
  private h2 = 0x01000193 ^ 0x5bd1e995;

  update(s: string): this {
    let { h1, h2 } = this;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
    }
    this.h1 = h1;
    this.h2 = h2;
    return this;
  }

  digest(): string {
    return (this.h1 >>> 0).toString(16).padStart(8, '0') + (this.h2 >>> 0).toString(16).padStart(8, '0');
  }
}
