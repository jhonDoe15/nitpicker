import path from 'node:path';
import {
  isScriptPath as untypedIsScript,
  scriptStem as untypedStem,
} from '../../../../shared/paths/script-stem.mjs';

const isScriptPath: (file: string) => boolean = untypedIsScript;
const scriptStem: (file: string) => string = untypedStem;

const RELATIVE_SPECIFIER = /(['"`])(\.{1,2}(?:\/[^'"`\s]*)?)\1/gu;
const AMBIGUOUS = Symbol('ambiguous');

export function stemMoves(renames: Iterable<readonly [string, string]>): Map<string, string> {
  const moves = new Map<string, string | typeof AMBIGUOUS>();
  for (const [oldPath, newPath] of renames) {
    if (isScriptPath(oldPath) && isScriptPath(newPath)) {
      const from = scriptStem(oldPath);
      const to = scriptStem(newPath);
      const known = moves.get(from);
      moves.set(from, known === undefined || known === to ? to : AMBIGUOUS);
    }
  }
  return new Map(
    [...moves].flatMap(([from, to]): [string, string][] => (to === AMBIGUOUS ? [] : [[from, to]])),
  );
}

function headForm(
  specifier: string,
  locations: { readonly directory: string; readonly newDirectory: string },
  stems: ReadonlyMap<string, string>,
): string {
  const { directory, newDirectory } = locations;
  const resolved = path.posix.normalize(path.posix.join(directory, specifier));
  const stem = scriptStem(resolved);
  const target = stems.get(stem) ?? stem;
  if (target === stem && newDirectory === directory) {
    return specifier;
  }
  const relative = path.posix.relative(newDirectory, target);
  const written = relative.startsWith('.') ? relative : `./${relative}`;
  return `${written === './' ? '.' : written}${resolved.slice(stem.length)}`;
}

export function canonicalSpecifiers(
  text: string,
  filePath: string,
  {
    stems,
    newFilePath = filePath,
  }: { readonly stems: ReadonlyMap<string, string>; readonly newFilePath?: string | undefined },
): string {
  if (
    typeof text !== 'string' ||
    !isScriptPath(filePath) ||
    !text.includes('.') ||
    (stems.size === 0 && newFilePath === filePath)
  ) {
    return text;
  }
  const locations = {
    directory: path.posix.dirname(filePath),
    newDirectory: path.posix.dirname(newFilePath),
  };
  return text.replace(
    RELATIVE_SPECIFIER,
    (_whole: string, quote: string, specifier: string) =>
      `${quote}${headForm(specifier, locations, stems)}${quote}`,
  );
}
