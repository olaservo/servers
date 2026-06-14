import { gzipSync } from "node:zlib";

// Minimal, deterministic archive builders (no external deps) so per-skill
// .tar.gz / .zip resources have stable bytes — and therefore stable digests.
// SKILL.md is placed at the archive root; entry paths are relative with `/`
// separators, per SEP-2640.

export interface ArchiveFile {
  path: string;
  content: Buffer;
}

// --- tar (ustar) ---------------------------------------------------------

const tarHeader = (name: string, size: number): Buffer => {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, "utf-8");
  h.write("0000644\0", 100); // mode
  h.write("0000000\0", 108); // uid
  h.write("0000000\0", 116); // gid
  h.write(size.toString(8).padStart(11, "0") + " ", 124); // size (octal)
  h.write("00000000000 ", 136); // mtime 0 (fixed for determinism)
  h.write("        ", 148); // checksum placeholder (8 spaces)
  h.write("0", 156); // typeflag: regular file
  h.write("ustar\0", 257); // magic
  h.write("00", 263); // version
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148); // checksum
  return h;
};

const tar = (files: ArchiveFile[]): Buffer => {
  const parts: Buffer[] = [];
  for (const f of files) {
    parts.push(tarHeader(f.path, f.content.length));
    parts.push(f.content);
    const pad = (512 - (f.content.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0)); // two zero blocks terminate the archive
  return Buffer.concat(parts);
};

export const tarGz = (files: ArchiveFile[]): Buffer => {
  const g = gzipSync(tar(files), { level: 9 });
  // Zero the gzip MTIME (bytes 4-7) and fix the OS byte (9) for determinism.
  g.writeUInt32LE(0, 4);
  g[9] = 0x03;
  return g;
};

// --- zip (store, no compression) ----------------------------------------

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const DOS_DATE = 0x0021; // 1980-01-01, fixed for determinism
const DOS_TIME = 0x0000;

export const zip = (files: ArchiveFile[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.path, "utf-8");
    const data = f.content;
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // local file header signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(0, 8); // method: store
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); // compressed size
    lh.writeUInt32LE(data.length, 22); // uncompressed size
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28); // extra length
    const local = Buffer.concat([lh, name, data]);
    locals.push(local);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // central directory header signature
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0, 8); // flags
    ch.writeUInt16LE(0, 10); // method: store
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30); // extra len
    ch.writeUInt16LE(0, 32); // comment len
    ch.writeUInt16LE(0, 34); // disk number
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42); // local header offset
    centrals.push(Buffer.concat([ch, name]));

    offset += local.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd start disk
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...locals, cd, eocd]);
};
