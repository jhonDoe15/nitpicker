import path from 'node:path';
import { isScriptPath, scriptStem } from '../../../../shared/paths/script-stem.mjs';

const RELATIVE_SPECIFIER = /(['"`])(\.{1,2}(?:\/[^'"`\s]*)?)\1/gu;
const AMBIGUOUS = Symbol('ambiguous');

export function stemMoves(renames) {
  const moves = new Map();
  for (const [oldPath, newPath] of renames) {
    if (isScriptPath(oldPath) && isScriptPath(newPath)) {
      const from = scriptStem(oldPath);
      const to = scriptStem(newPath);
      const known = moves.get(from);
      moves.set(from, known === undefined || known === to ? to : AMBIGUOUS);
    }
  }
  return new Map([...moves].filter(([, to]) => to !== AMBIGUOUS));
}

function headForm(specifier, locations, stems) {
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

export function canonicalSpecifiers(text, filePath, { stems, newFilePath = filePath }) {
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
    (_whole, quote, specifier) => `${quote}${headForm(specifier, locations, stems)}${quote}`,
  );
}
