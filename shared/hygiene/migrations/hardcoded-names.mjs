import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../filesystem.mjs';
import {
  escapeGlob,
  exceptionEntryText,
  exceptionSentence,
} from '../../messages/exception-sentence.mjs';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';
import { isMigrationFile } from './migration-files.mjs';
import { lineOf, readSource } from './revision-graph.mjs';

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
const PG_DUMP = /^-- Dumped (?:from database version|by pg_dump)/mu;

function nameOf(groups) {
  return groups.quoted ?? groups.ticked ?? groups.name;
}

const FORMS = [
  {
    key: 'public-schema',
    pattern: /(?<![\w$."])(?<quote>"?)public\k<quote>\s*\.\s*"?[A-Z_]/giu,
    accepts: () => true,
    skippedIn: ['drizzle-kit', 'atlas', 'pg_dump'],
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
      groups.name === undefined || !MYSQL_DATABASE_OPTIONS.has(groups.name.toLowerCase()),
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
    accepts: (groups) => !CURRENT_ROLES.has(nameOf(groups).toLowerCase()),
    skippedIn: ['pg_dump'],
    text: ({ file, line, name }) =>
      [
        `${file} hands ownership to the role \`${name}\` (line ${String(line)}).`,
        'Another install has other roles.',
        'Leave ownership with the role that runs the migration, or write OWNER TO CURRENT_USER.',
      ].join(' '),
  },
];

function snippetAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text
    .slice(start, end === -1 ? undefined : end)
    .trim()
    .replaceAll('`', "'")
    .slice(0, SNIPPET_LENGTH);
}

function existsInside(projectRoot, file) {
  const filePath = pathInside(projectRoot, file);
  return filePath !== undefined && existsSync(filePath);
}

function generator(projectRoot, file, text) {
  const folder = path.posix.dirname(file);
  if (PG_DUMP.test(text)) {
    return 'pg_dump';
  }
  if (existsInside(projectRoot, `${folder}/meta/_journal.json`)) {
    return 'drizzle-kit';
  }
  return existsInside(projectRoot, `${folder}/atlas.sum`) ? 'atlas' : undefined;
}

function blankComments(file, text) {
  const comments = COMMENTS.find(({ extensions }) => extensions.test(file));
  return comments === undefined
    ? text
    : text.replace(comments.pattern, (comment) => comment.replace(/[^\n]/gu, ' '));
}

function formFinding(tool, { file, text, code, form }) {
  const matches = [...code.matchAll(form.pattern)].filter((match) => form.accepts(match.groups));
  if (matches.length === 0) {
    return undefined;
  }
  const [first] = matches;
  const folder = path.posix.dirname(file);
  const glob = `${escapeGlob(folder)}/**`;
  const details = {
    file,
    count: matches.length,
    line: lineOf(text, first.index),
    snippet: snippetAt(text, first.index),
    name: nameOf(first.groups),
  };
  return {
    tool,
    rule: RULE,
    path: file,
    identity: `${RULE}|${file}|${form.key}`,
    message: `${form.text(details)} ${exceptionSentence(exceptionEntryText({ rule: RULE, glob }))}`,
    classification: 'enforceable',
    location: { line: details.line },
  };
}

export function hardcodedNameFindings(tool, { projectRoot, files }) {
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
