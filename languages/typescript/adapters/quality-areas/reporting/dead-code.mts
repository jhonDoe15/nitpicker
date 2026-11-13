import type { Finding } from '../../static-checks/shared.mts';
import type { KnipReport } from '../typed/reporting.mts';
import { escapeRegExp } from '../../typed/tooling.mts';
import { readProjectSource, reportOf } from './source-hashes.mts';
import { wholeFileHash } from '../hashing/whole-file-hash.mjs';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import {
  exceptionHint as untypedExceptionHint,
  isExcepted as untypedIsExcepted,
} from '../../../../../shared/hygiene/rules.mjs';
import { allowedFormField as untypedAllowedFormField } from '../../../../../shared/messages/messages.mjs';
import { PACKAGE_RULE_IDS } from '../../../../../shared/project-rules/hygiene-rules.mjs';
import {
  hash as untypedHash,
  nextOccurrence as untypedNextOccurrence,
  positiveInteger as untypedPositiveInteger,
} from '../../../../../shared/rules/finding-helpers.mjs';

type DeadCodeFinding = Finding & { readonly allowedForm?: string };

type NamedFinding = { readonly name?: string; readonly finding: DeadCodeFinding };

type DeadCodeMessage = { readonly message: string; readonly allowedForm?: string };

type IssueEntry = {
  readonly issue: Readonly<Record<string, unknown>>;
  readonly category: string;
  readonly entry: unknown;
  readonly analyzerName: string;
  readonly occurrences: Map<string, number>;
};

const exceptionHint: (rule: string, path: string, packageName: string) => string =
  untypedExceptionHint;
const isExcepted: (
  exceptions: readonly unknown[],
  target: {
    rule: string;
    path: string;
    packageName: string | undefined;
    symbol: string | undefined;
  },
) => boolean = untypedIsExcepted;
const allowedFormField: (...parts: readonly string[]) => { readonly allowedForm?: string } =
  untypedAllowedFormField;
const hash: (value: unknown) => string = untypedHash;
const nextOccurrence: (occurrences: Map<string, number>, key: string) => number =
  untypedNextOccurrence;
const positiveInteger: (value: unknown) => number | undefined = untypedPositiveInteger;

const DEAD_CODE_DECLARATIONS = new Map([
  ['exports', 'Export'],
  ['types', 'Exported type'],
]);
const DECLARATION_CATEGORIES = new Set(['files', 'exports', 'types']);
const PACKAGE_RULES = new Map<string, string>([
  ['dependencies', PACKAGE_RULE_IDS.unusedDependency],
  ['devDependencies', PACKAGE_RULE_IDS.unusedDependency],
  ['unlisted', PACKAGE_RULE_IDS.unlistedDependency],
  ['unresolved', PACKAGE_RULE_IDS.unresolvedImport],
]);

export function normalizeDeadCode(
  report: unknown,
  analyzerName: string,
  { exceptions = [] }: { readonly exceptions?: readonly unknown[] } = {},
): DeadCodeFinding[] {
  const occurrences = new Map<string, number>();
  return [
    ...listOf(fieldOf(report, 'files')).flatMap((file) => unusedFileFindings(file, analyzerName)),
    ...listOf(fieldOf(report, 'issues')).flatMap((issue) =>
      issueFindings({ issue: fieldsOf(issue), analyzerName, occurrences }),
    ),
  ]
    .filter(
      ({ finding, name }) =>
        !isExcepted(exceptions, {
          rule: finding.rule,
          path: finding.path,
          packageName: name,
          symbol: name,
        }),
    )
    .map(({ finding }) => finding);
}

function unusedFileFindings(file: unknown, analyzerName: string): NamedFinding[] {
  const filePath = typeof file === 'string' ? file : fieldOf(file, 'path');
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return [];
  }
  const finding = {
    tool: analyzerName,
    rule: 'files',
    path: filePath,
    identity: `file:${filePath}|source:${sourceHashOf(file) ?? hash(filePath)}`,
    message: unusedFileMessage(filePath),
    ...allowedFormField(UNUSED_FILE_ALLOWED_FORM),
    classification: 'enforceable',
  };
  return [{ finding }];
}

const UNUSED_FILE_ALLOWED_FORM = 'Delete it, or import it where it is needed.';

function sourceHashOf(entry: unknown): string | undefined {
  const sourceHash = fieldOf(entry, 'sourceHash');
  return sourceHash === undefined || sourceHash === null ? undefined : textOf(sourceHash);
}

function unusedFileMessage(filePath: string): string {
  return `Unused file: ${filePath}. Nothing imports it. ${UNUSED_FILE_ALLOWED_FORM}`;
}

function issueFindings({
  issue,
  analyzerName,
  occurrences,
}: Omit<IssueEntry, 'category' | 'entry'>): NamedFinding[] {
  return Object.entries(issue)
    .filter(([category, entries]) => category !== 'file' && Array.isArray(entries))
    .flatMap(([category, entries]) =>
      listOf(entries).flatMap((entry) =>
        entryFindings({ issue, category, entry, analyzerName, occurrences }),
      ),
    );
}

function entryFindings({
  issue,
  category,
  entry,
  analyzerName,
  occurrences,
}: IssueEntry): NamedFinding[] {
  const name = typeof entry === 'string' ? entry : fieldOf(entry, 'name');
  if (typeof name !== 'string' || name.length === 0) {
    return [];
  }
  const file = textOf(fieldOf(issue, 'file'));
  const rule = PACKAGE_RULES.get(category) ?? category;
  const declaration = DECLARATION_CATEGORIES.has(category);
  const occurrence = nextOccurrence(occurrences, `${file}\0${rule}\0${name}`);
  const sourceSuffix = declaration ? `|source:${sourceHashOf(entry) ?? hash(file)}` : '';
  const finding = {
    tool: analyzerName,
    rule,
    path: file,
    identity: `name:${name}|occurrence:${String(occurrence)}${sourceSuffix}`,
    ...deadCodeMessage({ category, name, entry, file }),
    symbol: name,
    classification: declaration || PACKAGE_RULES.has(category) ? 'enforceable' : 'descriptive',
    ...entryLocation(entry),
  };
  return [{ name, finding }];
}

function entryLocation(entry: unknown): Pick<Finding, 'location'> {
  const line = positiveInteger(fieldOf(entry, 'line'));
  if (line === undefined) {
    return {};
  }
  return { location: { line, column: positiveInteger(fieldOf(entry, 'col')) ?? 1 } };
}

function deadCodeMessage({
  category,
  name,
  entry,
  file,
}: {
  readonly category: string;
  readonly name: string;
  readonly entry: unknown;
  readonly file: string;
}): DeadCodeMessage {
  const rule = PACKAGE_RULES.get(category);
  if (rule !== undefined) {
    return { message: `${packageMessage(rule, name, file)} ${exceptionHint(rule, file, name)}` };
  }
  if (category === 'files') {
    return { message: unusedFileMessage(name), ...allowedFormField(UNUSED_FILE_ALLOWED_FORM) };
  }
  const kind = DEAD_CODE_DECLARATIONS.get(category);
  if (kind === undefined) {
    return { message: `${category}: ${name}` };
  }
  const allowedForm =
    fieldOf(entry, 'usedInFile') === true
      ? 'Remove `export`.'
      : `Remove \`export\`, or the ${category === 'types' ? 'type' : 'declaration'} if nothing uses it.`;
  const problem =
    fieldOf(entry, 'usedInFile') === true ? 'is only used in its own file' : 'is never imported';
  return { message: `${kind} ${name} ${problem}. ${allowedForm}`, allowedForm };
}

function packageMessage(rule: string, name: string, file: string): string {
  if (rule === PACKAGE_RULE_IDS.unusedDependency) {
    return `Unused dependency ${name}: nothing imports or runs it. Remove it from ${file}.`;
  }
  if (rule === PACKAGE_RULE_IDS.unlistedDependency) {
    return `Package ${name} is imported but not listed in package.json. Add it to dependencies (devDependencies for tests and tooling).`;
  }
  return `Import ${name} resolves to no file or package. Fix the path, or install the package and list it in package.json.`;
}

export function withDeadCodeSourceHashes(parsed: unknown, projectRoot: string): object {
  const report: KnipReport = reportOf(parsed, 'dead-code');
  return {
    ...report,
    files: (report.files ?? []).map((file) => ({
      path: file,
      sourceHash: wholeFileHash(readProjectSource(projectRoot, file), file),
    })),
    issues: (report.issues ?? []).map((issue) => {
      const lines = readProjectSource(projectRoot, String(issue['file'])).split('\n');
      return Object.fromEntries(
        Object.entries(issue).map(([category, entries]) => [
          category,
          Array.isArray(entries)
            ? listOf(entries).map((entry) => withDeclarationSourceHash(entry, lines))
            : entries,
        ]),
      );
    }),
  };
}

function withDeclarationSourceHash(entry: unknown, lines: readonly string[]): unknown {
  const line = positiveInteger(fieldOf(entry, 'line'));
  if (typeof entry !== 'object' || line === undefined || line > lines.length) {
    return entry;
  }
  return {
    ...fieldsOf(entry),
    sourceHash: hash(lines[line - 1]?.trim()),
    usedInFile: isUsedBesidesDeclaration(fieldOf(entry, 'name'), lines, line),
  };
}

function isUsedBesidesDeclaration(
  name: unknown,
  lines: readonly string[],
  declarationLine: number,
): boolean {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  const word = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, 'u');
  return lines.some((text, index) => index !== declarationLine - 1 && word.test(text));
}
