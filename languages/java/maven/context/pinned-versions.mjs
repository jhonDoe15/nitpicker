import { readFileSync } from 'node:fs';

export function pinnedVersionMap(initScript) {
  const block = /def pinned = \[([^\]]*)\]/u.exec(readFileSync(initScript, 'utf8'));
  const entries = [...(block?.[1] ?? '').matchAll(/(\w+)\s*:\s*'([^']+)'/gu)].map(
    ([, name, version]) => [name, version],
  );
  if (entries.length === 0) {
    throw new Error(`No pinned tool versions found in ${initScript}`);
  }
  return Object.fromEntries(entries);
}
