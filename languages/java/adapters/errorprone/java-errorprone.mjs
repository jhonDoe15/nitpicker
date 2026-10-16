import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { normalizeReportPath } from '../../ingest/common.mjs';
import { ingestErrorProne } from '../../ingest/errorprone/errorprone.mjs';
import { isClassExempt } from './exemptions/class-exemptions.mjs';
import { isIntegrationTestName } from './exemptions/test-class-names.mjs';
import { isLombokGenerated } from './lombok/lombok-generated.mjs';
import { sourceReader } from './lombok/source-text.mjs';

const ERROR_PRONE_REPORT = 'errorprone.json';
const SENTENCE_END = /[.?!:]$/u;
const CHECKS = JSON.parse(
  readFileSync(new URL('../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
);
const CERTAIN_BUGS = new Set(CHECKS.certainBugs);

export function readErrorProneFindings({
  reportRoot,
  roots,
  lintedRoots,
  manifest = {},
  kotlin = false,
}) {
  const reportPath = path.join(reportRoot, ERROR_PRONE_REPORT);
  if (!existsSync(reportPath)) {
    return [];
  }
  const testRoots = manifest.testSourceRoots ?? [];
  const { findings } = ingestErrorProne(
    withoutExemptCode(readFileSync(reportPath, 'utf8'), sourceReader(reportRoot)),
    {
      resolvePath: (file) => lintedPath(file, roots, lintedRoots),
      guava: (file) => (inRoots(file, testRoots) ? manifest.testGuava : manifest.guava) !== false,
    },
  );
  return kotlin ? findings : findings.map((finding) => withExceptionRoute(finding, testRoots));
}

function withoutExemptCode(json, readSource) {
  const diagnostics = JSON.parse(json);
  if (!Array.isArray(diagnostics)) {
    return json;
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

function lintedPath(file, roots, lintedRoots) {
  for (const root of roots) {
    const relative = normalizeReportPath(file, root);
    if (
      relative !== undefined &&
      lintedRoots.some((sourceRoot) => relative.startsWith(`${sourceRoot}/`))
    ) {
      return relative;
    }
  }
  return undefined;
}
