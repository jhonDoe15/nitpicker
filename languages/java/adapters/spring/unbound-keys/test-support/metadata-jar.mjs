import { writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

const LOCAL = {
  size: 30,
  signature: 0x04_03_4b_50,
  version: 4,
  method: 8,
  crc: 14,
  compressed: 18,
};
const CENTRAL = { size: 46, signature: 0x02_01_4b_50, made: 4, version: 6, method: 10, crc: 16 };
const END = { size: 22, signature: 0x06_05_4b_50, diskCount: 8, count: 10, length: 12, offset: 16 };
const LOCAL_SIZES = { uncompressed: 22, name: 26 };
const CENTRAL_SIZES = { compressed: 20, uncompressed: 24, name: 28, local: 42 };
const END_COMMENT = 20;
const ZIP_VERSION = 20;
const STORED = 0;
const DEFLATED = 8;

function localHeader(name, entry) {
  const header = Buffer.alloc(LOCAL.size);
  header.writeUInt32LE(LOCAL.signature, 0);
  header.writeUInt16LE(ZIP_VERSION, LOCAL.version);
  header.writeUInt16LE(entry.method, LOCAL.method);
  header.writeUInt32LE(entry.crc, LOCAL.crc);
  header.writeUInt32LE(entry.data.length, LOCAL.compressed);
  header.writeUInt32LE(entry.size, LOCAL_SIZES.uncompressed);
  header.writeUInt16LE(name.length, LOCAL_SIZES.name);
  return Buffer.concat([header, name]);
}

function centralHeader(name, entry) {
  const header = Buffer.alloc(CENTRAL.size);
  header.writeUInt32LE(CENTRAL.signature, 0);
  header.writeUInt16LE(ZIP_VERSION, CENTRAL.made);
  header.writeUInt16LE(ZIP_VERSION, CENTRAL.version);
  header.writeUInt16LE(entry.method, CENTRAL.method);
  header.writeUInt32LE(entry.crc, CENTRAL.crc);
  header.writeUInt32LE(entry.data.length, CENTRAL_SIZES.compressed);
  header.writeUInt32LE(entry.size, CENTRAL_SIZES.uncompressed);
  header.writeUInt16LE(name.length, CENTRAL_SIZES.name);
  header.writeUInt32LE(entry.offset, CENTRAL_SIZES.local);
  return Buffer.concat([header, name]);
}

function endRecord(count, size, offset, comment) {
  const record = Buffer.alloc(END.size);
  record.writeUInt32LE(END.signature, 0);
  record.writeUInt16LE(count, END.diskCount);
  record.writeUInt16LE(count, END.count);
  record.writeUInt32LE(size, END.length);
  record.writeUInt32LE(offset, END.offset);
  record.writeUInt16LE(comment.length, END_COMMENT);
  return Buffer.concat([record, comment]);
}

export function writeJar(file, files, { stored = false, comment = '' } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [entryName, text] of Object.entries(files)) {
    const name = Buffer.from(entryName);
    const content = Buffer.from(text);
    const entry = {
      method: stored ? STORED : DEFLATED,
      crc: crc32(content),
      size: content.length,
      data: stored ? content : deflateRawSync(content),
      offset,
    };
    const local = Buffer.concat([localHeader(name, entry), entry.data]);
    locals.push(local);
    centrals.push(centralHeader(name, entry));
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  writeFileSync(
    file,
    Buffer.concat([
      ...locals,
      central,
      endRecord(centrals.length, central.length, offset, Buffer.from(comment)),
    ]),
  );
}

export function metadataJson({ properties = [], groups = [] }) {
  return JSON.stringify({
    groups: groups.map((name) => ({ name })),
    properties: properties.map((property) =>
      typeof property === 'string' ? { name: property, type: 'java.lang.String' } : property,
    ),
  });
}
