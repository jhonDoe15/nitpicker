import { readFileSync } from 'node:fs';
import {
  blankLiterals as blankLiteralsUntyped,
  pathInside as pathInsideUntyped,
} from '../review-rules/java-sources.mts';

const blankLiterals: (text: string) => string = blankLiteralsUntyped;
const pathInside: (base: string, relative: string) => string = pathInsideUntyped;

const SOURCES = [
  {
    library: 'java.util.UUID',
    shown: 'UUID.randomUUID()',
    call: /\bUUID\s*\.\s*randomUUID\s*\(/u,
    imported: /^\s*import\s+(?:static\s+)?java\.util\.UUID\.(?:randomUUID|\*)\b/mu,
    bare: /(?<![\w.])randomUUID\s*\(/u,
  },
  {
    library: 'kotlin.uuid.Uuid',
    shown: 'Uuid.random()',
    call: /\bUuid\s*\.\s*random\s*\(/u,
    imported: /^\s*import\s+kotlin\.uuid\.Uuid\.Companion\.random\b/mu,
    bare: /(?<![\w.])random\s*\(/u,
  },
];

type RandomSource = (typeof SOURCES)[number];

function calls(text: string, source: RandomSource): boolean {
  return source.call.test(text) || (source.imported.test(text) && source.bare.test(text));
}

export function randomSourceCalls(
  projectRoot: string,
  file: string,
): { library: string; shown: string }[] {
  const text = blankLiterals(readFileSync(pathInside(projectRoot, file), 'utf8'));
  return SOURCES.filter((source) => calls(text, source)).map(({ library, shown }) => ({
    library,
    shown,
  }));
}
