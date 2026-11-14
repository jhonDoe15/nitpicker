import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { normalizeReportPath } from '../../../../shared/ingest/common.mjs';
import { ingestErrorProne } from '../../ingest/errorprone/errorprone.mjs';
import { isClassExempt } from './exemptions/class-exemptions.mjs';
import { isIntegrationTestName } from './exemptions/test-class-names.mjs';
import { isLombokGenerated } from './lombok/lombok-generated.mjs';
import { sourceReader } from './lombok/source-text.mjs';

const ERROR_PRONE_REPORT = 'errorprone.json';
const SENTENCE_END = /[.?!:]$/u;
const LISTED_OUTSIDE_FILES = 5;
const CHECKS = JSON.parse(
  readFileSync(new URL('../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
);
const CERTAIN_BUGS = new Set(CHECKS.certainBugs);
const KNOWN_CRASHES = new Map([
  [
    'UnnecessarilyFullyQualified',
    /JCIdent cannot be cast to (?:class )?com\.sun\.source\.tree\.MemberSelectTree/u,
  ],
]);

export function readErrorProneFindings({ reportRoot, roots, lintedRoots, manifest = {} }) {
  const reportPath = path.join(reportRoot, ERROR_PRONE_REPORT);
  if (!existsSync(reportPath)) {
    return [toolError('missing-report', `Error Prone wrote no report at ${reportPath}.`)];
  }
  const testRoots = manifest.testSourceRoots ?? [];
  const outside = new Set();
  const { diagnostics, crashes } = splitCrashes(JSON.parse(readFileSync(reportPath, 'utf8')));
  const { findings } = ingestErrorProne(withoutExemptCode(diagnostics, sourceReader(reportRoot)), {
    resolvePath: (file) => lintedPath(file, { roots, lintedRoots, outside }),
    guava: (file) => (inRoots(file, testRoots) ? manifest.testGuava : manifest.guava) !== false,
  });
  return [
    ...findings.map((finding) => withExceptionRoute(finding, testRoots)),
    ...(outside.size === 0 ? [] : [unmappedError(outside, roots)]),
    ...crashes.map((crash) => crashError(crash, roots)),
  ];
}

function splitCrashes(diagnostics) {
  if (!Array.isArray(diagnostics)) {
    return { diagnostics, crashes: [] };
  }
  return {
    diagnostics: diagnostics.filter((diagnostic) => !isCrash(diagnostic)),
    crashes: diagnostics.filter(isCrash),
  };
}

function isCrash(diagnostic) {
  return typeof diagnostic?.crash === 'string';
}

function isKnownCrash({ crash, cause }) {
  return typeof cause === 'string' && KNOWN_CRASHES.get(crash)?.test(cause) === true;
}

function crashError({ crash, file, line, cause }, roots) {
  const [relative = file] = projectRelative(file, roots);
  const why = typeof cause === 'string' && cause !== '' ? ` (${cause})` : '';
  const known = isKnownCrash({ crash, cause });
  const consequence = known
    ? ', a known Error Prone bug, so it was turned off for this run and only its findings are missing. ' +
      'The crash is not a problem in this code.'
    : ', so it was turned off for this run and the findings of the other checks are kept. ' +
      'The crash is an Error Prone bug, not a problem in this code.';
  return {
    ...toolError(
      'check-crashed',
      `Error Prone's ${crash} check crashed on ${relative}:${String(line)}${why}${consequence}`,
    ),
    identity: `check-crashed:${crash}`,
    ...(known ? { classification: 'descriptive' } : {}),
  };
}

function toolError(rule, message) {
  return {
    tool: 'errorprone',
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function unmappedError(outside, roots) {
  const files = [...outside].toSorted();
  return toolError(
    'unmapped-path',
    `Error Prone reported ${String(files.length)} file(s) outside the project (${roots.join(', ')}), ` +
      `so their findings cannot be placed: ${files.slice(0, LISTED_OUTSIDE_FILES).join(', ')}`,
  );
}

function withoutExemptCode(diagnostics, readSource) {
  if (!Array.isArray(diagnostics)) {
    return JSON.stringify(diagnostics);
  }
  const texts = new Map();
  function textOf(file) {
    if (!texts.has(file)) {
      texts.set(file, readSource(file));
    }
    return texts.get(file);
  }
  return JSON.stringify(
    diagnostics.filter(
      (diagnostic) =>
        !isClassExempt(diagnostic, CHECKS.classExemptions) &&
        !isIntegrationTestName(diagnostic) &&
        !isLombokGenerated(diagnostic, textOf(diagnostic.file)),
    ),
  );
}

function withExceptionRoute(finding, testRoots) {
  if (CERTAIN_BUGS.has(finding.rule) && !inRoots(finding.path, testRoots)) {
    return finding;
  }
  const rule = `${finding.tool}/${finding.rule}`;
  const sentence = SENTENCE_END.test(finding.message) ? finding.message : `${finding.message}.`;
  return { ...finding, message: `${sentence} ${exceptionHint(rule, finding.path)}` };
}

function inRoots(file, roots) {
  return roots.some((root) => file.startsWith(`${root}/`));
}

function projectRelative(file, roots) {
  return roots
    .map((root) => normalizeReportPath(file, root) ?? caseInsensitiveRelative(file, root))
    .filter((relative) => relative !== undefined);
}

function slashed(text) {
  return text.replaceAll('\\', '/');
}

function caseInsensitiveRelative(file, root) {
  if (process.platform !== 'win32') {
    return undefined;
  }
  const prefix = `${slashed(root).replace(/\/+$/u, '')}/`;
  const candidate = slashed(file);
  return candidate.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalizeReportPath(candidate.slice(prefix.length))
    : undefined;
}

function lintedPath(file, { roots, lintedRoots, outside }) {
  const relatives = projectRelative(file, roots);
  if (relatives.length === 0) {
    outside.add(file);
    return undefined;
  }
  return relatives.find((relative) =>
    lintedRoots.some((sourceRoot) => relative.startsWith(`${sourceRoot}/`)),
  );
}
