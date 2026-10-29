import { spawnSync } from 'node:child_process';

const MAX_BLOB_BYTES = 1_000_000;
const HEADER_ROOM = 256;

function catFile(repositoryRoot, mode, { specs, maxBuffer }) {
  const result = spawnSync('git', ['cat-file', mode], {
    cwd: repositoryRoot,
    input: `${specs.join('\n')}\n`,
    maxBuffer,
  });
  return result.error === undefined && result.status === 0 ? result.stdout : undefined;
}

function blobSizes(repositoryRoot, specs) {
  const output = catFile(repositoryRoot, '--batch-check=%(objecttype) %(objectsize)', {
    specs,
    maxBuffer: specs.length * HEADER_ROOM,
  });
  return (output?.toString('utf8').split('\n') ?? []).map((line) => {
    const [type, size] = line.split(' ');
    return type === 'blob' ? Number(size) : Number.NaN;
  });
}

function parseBatch(output, specs) {
  const texts = new Map();
  const cursor = { at: 0 };
  for (const spec of specs) {
    const headerEnd = output.indexOf(10, cursor.at);
    const size = Number(output.subarray(cursor.at, headerEnd).toString('utf8').split(' ').at(-1));
    if (headerEnd === -1 || !Number.isInteger(size)) {
      return texts;
    }
    texts.set(spec, output.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8'));
    cursor.at = headerEnd + size + 2;
  }
  return texts;
}

export function readBlobTexts(repositoryRoot, specs) {
  const unique = [...new Set(specs)].filter((spec) => !spec.includes('\n'));
  if (unique.length === 0) {
    return new Map();
  }
  const sizes = blobSizes(repositoryRoot, unique);
  const wanted = unique
    .map((spec, index) => ({ spec, size: sizes[index] }))
    .filter(({ size }) => size <= MAX_BLOB_BYTES);
  const total = wanted.reduce((sum, { size }) => sum + size, 0);
  const output =
    wanted.length === 0
      ? undefined
      : catFile(repositoryRoot, '--batch', {
          specs: wanted.map(({ spec }) => spec),
          maxBuffer: total + wanted.length * HEADER_ROOM,
        });
  return output === undefined
    ? new Map()
    : parseBatch(
        output,
        wanted.map(({ spec }) => spec),
      );
}
