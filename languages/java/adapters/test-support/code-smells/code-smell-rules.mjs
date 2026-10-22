import { readFileSync } from 'node:fs';
import path from 'node:path';

const CODE_SMELL_RULESET = path.resolve(
  import.meta.dirname,
  '../../../gradle/code-smells-ruleset.xml',
);

export function codeSmellRules() {
  const xml = readFileSync(CODE_SMELL_RULESET, 'utf8');
  return [...xml.matchAll(/<rule (?:name="(\w+)"|ref="[^"]*\/(\w+)")[^>]*?message="([^"]*)"/g)].map(
    (match) => ({ name: match[1] ?? match[2], message: match[3] }),
  );
}
