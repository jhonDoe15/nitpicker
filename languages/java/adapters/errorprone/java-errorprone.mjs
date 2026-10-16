import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../shared/policy.mjs';
import { normalizeReportPath } from '../../ingest/common.mjs';
import { ingestErrorProne } from '../../ingest/errorprone/errorprone.mjs';
import { isClassExempt } from './exemptions/class-exemptions.mjs';
import { isLombokGenerated } from './lombok/lombok-generated.mjs';

const ERROR_PRONE_REPORT = 'errorprone.json';
const SENTENCE_END = /[.?!:]$/u;
const CHECKS = JSON.parse(
  readFileSync(new URL('../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
);
const CERTAIN_BUGS = new Set(CHECKS.certainBugs);

export function readErrorProneFindings({ reportRoot, roots, lintedRoots, kotlin = false }) {
  const reportPath = path.join(reportRoot, ERROR_PRONE_REPORT);
  if (!existsSync(reportPath)) {
    return [];
  }
  const { findings } = ingestErrorProne(withoutExemptCode(readFileSync(reportPath, 'utf8')), {
    resolvePath: (file) => lintedPath(file, roots, lintedRoots),
  });
  return kotlin ? findings : findings.map((finding) => withExceptionRoute(finding));
}

function withoutExemptCode(json) {
  const diagnostics = JSON.parse(json);
  if (!Array.isArray(diagnostics)) {
    return json;
  }
  const texts = new Map();
  function textOf(file) {
    if (!texts.has(file)) {
      texts.set(
        file,
        typeof file === 'string' && existsSync(file) ? readFileSync(file, 'utf8') : '',
      );
    }
    return texts.get(file);
  }
  return JSON.stringify(
    diagnostics.filter(
      (diagnostic) =>
        !isClassExempt(diagnostic, CHECKS.classExemptions) &&
        !isLombokGenerated(diagnostic, textOf(diagnostic.file)),
    ),
  );
}

function withExceptionRoute(finding) {
  if (CERTAIN_BUGS.has(finding.rule)) {
    return finding;
  }
  const rule = `${finding.tool}/${finding.rule}`;
  const sentence = SENTENCE_END.test(finding.message) ? finding.message : `${finding.message}.`;
  return { ...finding, message: `${sentence} ${exceptionHint(rule, finding.path)}` };
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
