import { writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

function localHeader(name, entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04_03_4b_50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name]);
}

function centralHeader(name, entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02_01_4b_50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, name]);
}

function endRecord(count, size, offset, comment) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06_05_4b_50, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(comment.length, 20);
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
      method: stored ? 0 : 8,
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
