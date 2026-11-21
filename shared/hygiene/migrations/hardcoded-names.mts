import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../filesystem.mts';
import {
  escapeGlob,
  exceptionEntryText,
  exceptionSentence,
} from '../../messages/exception-sentence.mts';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { isMigrationFile } from './migration-files.mts';
import { lineAt } from '../../conventions/lines.mts';
import { readSource } from './revision-graph.mts';
import type { RepositoryContext } from '../check-types.mts';
import type { Finding } from '../../values/findings.mts';

type Groups = Readonly<Record<string, string | undefined>>;
type Details = {
  readonly file: string;
  readonly count: number;
  readonly line: number;
  readonly snippet: string;
  readonly name: string;
};
type Form = {
  readonly key: string;
  readonly pattern: RegExp;
  readonly accepts: (groups: Groups) => boolean;
  readonly skippedIn: readonly (string | undefined)[];
  readonly text: (details: Details) => string;
};

const RULE = HYGIENE_RULE_IDS.migrationHardcodedName;
const MYSQL_DATABASE_OPTIONS = new Set([
  'character',
  'charset',
  'default',
  'collate',
  'encryption',
  'read',
  'upgrade',
]);
const SNIPPET_LENGTH = 80;
const CURRENT_ROLES = new Set(['current_user', 'current_role', 'session_user']);
const NAMED = String.raw`(?:"(?<quoted>[^"\n]+)"|\x60(?<ticked>[^\x60\n]+)\x60|(?<name>[A-Z_][\w$]*)(?![\w$(]))`;
const BLOCK_COMMENT = String.raw`/\*[\s\S]*?\*/`;
const COMMENTS = [
  {
    extensions: /\.(?:sql|ya?ml)$/u,
    pattern: new RegExp(String.raw`${BLOCK_COMMENT}|--[^\n]*`, 'gu'),
  },
  {
    extensions: /\.xml$/u,
    pattern: new RegExp(String.raw`<!--[\s\S]*?-->|${BLOCK_COMMENT}|--[^\n]*`, 'gu'),
  },
  { extensions: /\.py$/u, pattern: /#[^\n]*|--[^\n]*/gu },
  {
    extensions: /\.(?:[cm]?[jt]s|java|kt|go)$/u,
    pattern: new RegExp(String.raw`${BLOCK_COMMENT}|//[^\n]*|--[^\n]*`, 'gu'),
  },
];
const PG_DUMP_NAME = 'pg_dump';
const PG_DUMP = /^-- Dumped (?:from database version|by pg_dump)/mu;

function nameOf(groups: Groups): string | undefined {
  return groups['quoted'] ?? groups['ticked'] ?? groups['name'];
}

const FORMS: readonly Form[] = [
  {
    key: 'public-schema',
    pattern: /(?<![\w$."])(?<quote>"?)public\k<quote>\s*\.\s*"?[A-Z_]/giu,
    accepts: () => true,
    skippedIn: ['drizzle-kit', 'atlas', PG_DUMP_NAME],
    text: ({ file, count, line, snippet }) =>
      [
        `${file} qualifies ${String(count)} ${count === 1 ? 'name' : 'names'} with the \`public\` schema`,
        `(first on line ${String(line)}: \`${snippet}\`).`,
        'An install that keeps its tables in another schema (search_path set to it) misses them.',
        'Leave the schema out and let search_path resolve the name.',
      ].join(' '),
  },
  {
    key: 'database-name',
    pattern: new RegExp(String.raw`\bALTER\s+DATABASE\s+${NAMED}`, 'giu'),
    accepts: (groups) =>
      groups['name'] === undefined || !MYSQL_DATABASE_OPTIONS.has(groups['name'].toLowerCase()),
    skippedIn: [],
    text: ({ file, line, name }) =>
      [
        `${file} names the database \`${name}\` in ALTER DATABASE (line ${String(line)}).`,
        'Another install has another database name.',
        'Target the current database instead: in PostgreSQL build the statement from current_database()',
        "(`EXECUTE format('ALTER DATABASE %I ...', current_database())` in a DO block); in MySQL leave the name out.",
      ].join(' '),
  },
  {
    key: 'owner-name',
    pattern: new RegExp(String.raw`\bOWNER\s+TO\s+${NAMED}`, 'giu'),
    accepts: (groups) => !CURRENT_ROLES.has((nameOf(groups) ?? '').toLowerCase()),
    skippedIn: [PG_DUMP_NAME],
    text: ({ file, line, name }) =>
      [
        `${file} hands ownership to the role \`${name}\` (line ${String(line)}).`,
        'Another install has other roles.',
        'Leave ownership with the role that runs the migration, or write OWNER TO CURRENT_USER.',
      ].join(' '),
  },
];

function snippetAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text
    .slice(start, end === -1 ? undefined : end)
    .trim()
    .replaceAll('`', "'")
    .slice(0, SNIPPET_LENGTH);
}

function existsInside(projectRoot: string, file: string): boolean {
  const filePath = pathInside(projectRoot, file);
  return filePath !== undefined && existsSync(filePath);
}

function generator(projectRoot: string, file: string, text: string): string | undefined {
  const folder = path.posix.dirname(file);
  if (PG_DUMP.test(text)) {
    return PG_DUMP_NAME;
  }
  if (existsInside(projectRoot, `${folder}/meta/_journal.json`)) {
    return 'drizzle-kit';
  }
  return existsInside(projectRoot, `${folder}/atlas.sum`) ? 'atlas' : undefined;
}

function blankComments(file: string, text: string): string {
  const comments = COMMENTS.find(({ extensions }) => extensions.test(file));
  return comments === undefined
    ? text
    : text.replace(comments.pattern, (comment) => comment.replace(/[^\n]/gu, ' '));
}

function formFinding(
  tool: string,
  {
    file,
    text,
    code,
    form,
  }: {
    readonly file: string;
    readonly text: string;
    readonly code: string;
    readonly form: Form;
  },
): Finding | undefined {
  const matches = [...code.matchAll(form.pattern)].filter((match) =>
    form.accepts(match.groups ?? {}),
  );
  const [first] = matches;
  if (first === undefined) {
    return undefined;
  }
  const folder = path.posix.dirname(file);
  const glob = `${escapeGlob(folder)}/**`;
  const details = {
    file,
    count: matches.length,
    line: lineAt(text, first.index),
    snippet: snippetAt(text, first.index),
    name: nameOf(first.groups ?? {}) ?? '',
  };
  return {
    tool,
    rule: RULE,
    path: file,
    identity: `${RULE}|${file}|${form.key}`,
    message: `${form.text(details)} ${exceptionSentence(exceptionEntryText({ rule: RULE, path: folder, glob }))}`,
    classification: 'enforceable',
    location: { line: details.line },
  };
}

export function hardcodedNameFindings(
  tool: string,
  { projectRoot, files }: Pick<RepositoryContext, 'projectRoot' | 'files'>,
): Finding[] {
  return files.filter(isMigrationFile).flatMap((file) => {
    const text = readSource(projectRoot, file);
    if (text === undefined) {
      return [];
    }
    const source = generator(projectRoot, file, text);
    const code = blankComments(file, text);
    return FORMS.filter((form) => !form.skippedIn.includes(source))
      .map((form) => formFinding(tool, { file, text, code, form }))
      .filter((finding) => finding !== undefined);
  });
}
