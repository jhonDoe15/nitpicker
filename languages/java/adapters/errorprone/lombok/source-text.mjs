import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ALIASES = [
  [/^cp(\d+)$/iu, 'windows-$1'],
  [/^iso8859_(\d+)$/iu, 'iso-8859-$1'],
  [/^utf8$/iu, 'utf-8'],
];

function decoderFor(encoding) {
  const label = ALIASES.reduce((name, [pattern, alias]) => name.replace(pattern, alias), encoding);
  try {
    return { decoder: new TextDecoder(label, { ignoreBOM: true }) };
  } catch {
    return { decoder: new TextDecoder('utf-8', { ignoreBOM: true }), unsupported: label };
  }
}

function sourceEncodings(reportRoot) {
  const work = path.join(reportRoot, 'errorprone');
  const argumentFiles = existsSync(work)
    ? readdirSync(work).filter((name) => name.endsWith('.args'))
    : [];
  return new Map(
    argumentFiles.flatMap((name) => {
      const lines = readFileSync(path.join(work, name), 'utf8').split('\n');
      const separator = lines.indexOf('--sources');
      const head = lines.slice(0, separator);
      const flag = head.indexOf('-encoding');
      const encoding = flag === -1 ? 'utf-8' : head[flag + 1];
      return lines
        .slice(separator + 1)
        .filter((line) => line !== '')
        .map((source) => [source, encoding]);
    }),
  );
}

export function sourceReader(reportRoot) {
  const encodings = sourceEncodings(reportRoot);
  const decoders = new Map();
  return (file) => {
    if (typeof file !== 'string' || !existsSync(file)) {
      return '';
    }
    const encoding = encodings.get(file) ?? 'utf-8';
    if (!decoders.has(encoding)) {
      decoders.set(encoding, decoderFor(encoding).decoder);
    }
    return decoders.get(encoding).decode(readFileSync(file));
  };
}
