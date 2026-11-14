import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { normalizeReportPath } from '../../../../shared/ingest/common.mjs';
import { ingestErrorProne } from '../../ingest/errorprone/errorprone.mjs';
import { isClassExempt } from './exemptions/class-exemptions.mjs';
import { isIntegrationTestName } from './exemptions/test-class-names.mjs';
import { isLombokGenerated } from './lombok/lombok-generated.mjs';
import { sourceReader } from './lombok/source-text.mjs';
import { errorProneChecks } from './checks/checks-docs.mts';
import type { ErrorProneChecks } from './checks/checks-shape.mts';
import { callUntyped } from '../typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type ReportContext = Readonly<Record<string, unknown>> & { readonly reportRoot: string };
type Placement = {
  readonly roots: readonly string[];
  readonly lintedRoots: readonly string[];
  readonly outside: Set<string>;
};
type Finding = Readonly<Record<string, unknown>>;

const ERROR_PRONE_REPORT = 'errorprone.json';
const SENTENCE_END = /[.?!:]$/u;
const LISTED_OUTSIDE_FILES = 5;

function guavaRead(manifest: unknown, testRoots: readonly string[]): (file: string) => boolean {
  return (file) => fieldOf(manifest, inRoots(file, testRoots) ? 'testGuava' : 'guava') !== false;
}

export function readErrorProneFindings(context: ReportContext): Finding[] {
  const reportPath = path.join(context.reportRoot, ERROR_PRONE_REPORT);
  if (!existsSync(reportPath)) {
    return [toolError('missing-report', `Error Prone wrote no report at ${reportPath}.`)];
  }
  const roots = textsOf(context['roots']);
  const placement = {
    roots,
    lintedRoots: textsOf(context['lintedRoots']),
    outside: new Set<string>(),
  };
  const manifest = context['manifest'];
  const testRoots = textsOf(fieldOf(manifest, 'testSourceRoots'));
  const report: unknown = JSON.parse(readFileSync(reportPath, 'utf8'));
  const { diagnostics, crashes } = splitCrashes(report);
  const readSource: unknown = sourceReader(context.reportRoot);
  const checks = errorProneChecks();
  const ingested = callUntyped(
    ingestErrorProne,
    withoutExemptCode(diagnostics, readSource, checks),
    {
      resolvePath: (file: string) => lintedPath(file, placement),
      guava: guavaRead(manifest, testRoots),
    },
  );
  return [
    ...listOf(fieldOf(ingested, 'findings')).map((finding) =>
      withExceptionRoute(fieldsOf(finding), testRoots, checks),
    ),
    ...(placement.outside.size === 0 ? [] : [unmappedError(placement.outside, roots)]),
    ...crashes.map((crash) => crashError(crash, roots)),
  ];
}

function isCrash(diagnostic: unknown): boolean {
  return typeof fieldOf(diagnostic, 'crash') === 'string';
}

function splitCrashes(diagnostics: unknown): { diagnostics: unknown; crashes: unknown[] } {
  if (!Array.isArray(diagnostics)) {
    return { diagnostics, crashes: [] };
  }
  const all = listOf(diagnostics);
  return {
    diagnostics: all.filter((diagnostic) => !isCrash(diagnostic)),
    crashes: all.filter((diagnostic) => isCrash(diagnostic)),
  };
}

const KNOWN_CRASHES = new Map([
  [
    'UnnecessarilyFullyQualified',
    /JCIdent cannot be cast to (?:class )?com\.sun\.source\.tree\.MemberSelectTree/u,
  ],
]);

function isKnownCrash(check: string, cause: unknown): boolean {
  return typeof cause === 'string' && KNOWN_CRASHES.get(check)?.test(cause) === true;
}

function crashError(crash: unknown, roots: readonly string[]): Finding {
  const file = textOf(fieldOf(crash, 'file'));
  const [relative = file] = projectRelative(file, roots);
  const cause = fieldOf(crash, 'cause');
  const why = typeof cause === 'string' && cause !== '' ? ` (${cause})` : '';
  const check = textOf(fieldOf(crash, 'crash'));
  const line = textOf(fieldOf(crash, 'line'));
  const known = isKnownCrash(check, cause);
  const consequence = known
    ? ', a known Error Prone bug, so it was turned off for this run and only its findings are missing. ' +
      'The crash is not a problem in this code.'
    : ', so it was turned off for this run and the findings of the other checks are kept. ' +
      'The crash is an Error Prone bug, not a problem in this code.';
  return {
    ...toolError(
      'check-crashed',
      `Error Prone's ${check} check crashed on ${relative}:${line}${why}${consequence}`,
    ),
    identity: `check-crashed:${check}`,
    ...(known ? { classification: 'descriptive' } : {}),
  };
}

function toolError(rule: string, message: string): Finding {
  return {
    tool: 'errorprone',
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function unmappedError(outside: ReadonlySet<string>, roots: readonly string[]): Finding {
  const files = [...outside].toSorted();
  return toolError(
    'unmapped-path',
    `Error Prone reported ${String(files.length)} file(s) outside the project (${roots.join(', ')}), ` +
      `so their findings cannot be placed: ${files.slice(0, LISTED_OUTSIDE_FILES).join(', ')}`,
  );
}

function withoutExemptCode(
  diagnostics: unknown,
  readSource: unknown,
  checks: ErrorProneChecks,
): string {
  if (!Array.isArray(diagnostics)) {
    return JSON.stringify(diagnostics);
  }
  const texts = new Map<string, unknown>();
  function sourceOf(file: string): unknown {
    if (!texts.has(file)) {
      texts.set(file, callUntyped(readSource, file));
    }
    return texts.get(file);
  }
  return JSON.stringify(
    listOf(diagnostics).filter(
      (diagnostic) =>
        !(
          isClassExempt(diagnostic, checks.classExemptions) ||
          isIntegrationTestName(diagnostic) ||
          isLombokGenerated(diagnostic, sourceOf(textOf(fieldOf(diagnostic, 'file'))))
        ),
    ),
  );
}

function withExceptionRoute(
  finding: Finding,
  testRoots: readonly string[],
  checks: ErrorProneChecks,
): Finding {
  const findingPath = textOf(finding['path']);
  if (checks.certainBugs.includes(textOf(finding['rule'])) && !inRoots(findingPath, testRoots)) {
    return finding;
  }
  const rule = `${textOf(finding['tool'])}/${textOf(finding['rule'])}`;
  const message = textOf(finding['message']);
  const sentence = SENTENCE_END.test(message) ? message : `${message}.`;
  return { ...finding, message: `${sentence} ${textOf(exceptionHint(rule, findingPath))}` };
}

function inRoots(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => file.startsWith(`${root}/`));
}

function relativeTo(file: string, root: string): string | undefined {
  const normalized: unknown = normalizeReportPath(file, root);
  return typeof normalized === 'string' ? normalized : caseInsensitiveRelative(file, root);
}

function projectRelative(file: string, roots: readonly string[]): string[] {
  return roots.map((root) => relativeTo(file, root)).filter((relative) => relative !== undefined);
}

function slashed(text: string): string {
  return text.replaceAll('\\', '/');
}

function caseInsensitiveRelative(file: string, root: string): string | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }
  const prefix = `${slashed(root).replace(/\/+$/u, '')}/`;
  const candidate = slashed(file);
  if (!candidate.toLowerCase().startsWith(prefix.toLowerCase())) {
    return undefined;
  }
  const normalized: unknown = normalizeReportPath(candidate.slice(prefix.length));
  return typeof normalized === 'string' ? normalized : undefined;
}

function lintedPath(file: string, { roots, lintedRoots, outside }: Placement): string | undefined {
  const relatives = projectRelative(file, roots);
  if (relatives.length === 0) {
    outside.add(file);
    return undefined;
  }
  return relatives.find((relative) =>
    lintedRoots.some((sourceRoot) => relative.startsWith(`${sourceRoot}/`)),
  );
}
