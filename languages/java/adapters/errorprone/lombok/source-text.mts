import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ALIASES: readonly (readonly [RegExp, string])[] = [
  [/^cp(\d+)$/iu, 'windows-$1'],
  [/^iso8859_(\d+)$/iu, 'iso-8859-$1'],
  [/^utf8$/iu, 'utf-8'],
];

function decoderFor(encoding: string): { decoder: TextDecoder; unsupported?: string } {
  const label = ALIASES.reduce((name, [pattern, alias]) => name.replace(pattern, alias), encoding);
  try {
    return { decoder: new TextDecoder(label, { ignoreBOM: true }) };
  } catch {
    return { decoder: new TextDecoder('utf-8', { ignoreBOM: true }), unsupported: label };
  }
}

function sourceEncodings(reportRoot: string): Map<string, string> {
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
      const encoding = flag === -1 ? 'utf-8' : (head[flag + 1] ?? 'utf-8');
      return lines
        .slice(separator + 1)
        .filter((line) => line !== '')
        .map((source): [string, string] => [source, encoding]);
    }),
  );
}

export function compiledSources(reportRoot: string): string[] {
  return [...sourceEncodings(reportRoot).keys()];
}

export function sourceReader(reportRoot: string): (file: unknown) => string {
  const encodings = sourceEncodings(reportRoot);
  const decoders = new Map<string, TextDecoder>();
  return (file: unknown) => {
    if (typeof file !== 'string' || !existsSync(file)) {
      return '';
    }
    const encoding = encodings.get(file) ?? 'utf-8';
    const decoder = decoders.get(encoding) ?? decoderFor(encoding).decoder;
    decoders.set(encoding, decoder);
    return decoder.decode(readFileSync(file));
  };
}
