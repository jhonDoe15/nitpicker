import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { nextOccurrence } from '../../../../../shared/rules/finding-helpers.mjs';
import { readKotlinFile } from './model/kotlin-file.mjs';
import { repositoryTypesOf } from './project-types.mjs';
import { KOTLIN_SPRING_RULES } from './spring-rules.mjs';
import { lineOf } from './syntax/kotlin-tree.mjs';

export const SYNTAX_REPORT = 'kotlin-syntax.json';

function findingOf({ file, rule, hit, occurrences }) {
  const key = `${file.source.file}\0${rule.name}\0${hit.symbol}`;
  const occurrence = nextOccurrence(occurrences, key);
  return {
    tool: 'spring',
    rule: rule.name,
    path: file.source.file,
    identity:
      occurrence === 1
        ? `${rule.name}:${hit.symbol}`
        : `${rule.name}:${hit.symbol}#${String(occurrence)}`,
    symbol: hit.symbol,
    location: { line: lineOf(file.source, hit.node.s) },
    message: rule.message,
    classification: 'enforceable',
  };
}

export function springFindingsOf(files) {
  const project = { repositoryTypes: repositoryTypesOf(files) };
  const occurrences = new Map();
  return files.flatMap((file) =>
    KOTLIN_SPRING_RULES.flatMap((rule) =>
      rule.check(file, project).map((hit) => findingOf({ file, rule, hit, occurrences })),
    ),
  );
}

export function readKotlinSpringFindings({ projectRoot, reportRoot }) {
  const report = path.join(reportRoot, SYNTAX_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const { files } = JSON.parse(readFileSync(report, 'utf8'));
  return springFindingsOf(
    files.map(({ file, tree }) =>
      readKotlinFile({ file, tree, text: readFileSync(path.join(projectRoot, file), 'utf8') }),
    ),
  );
}
