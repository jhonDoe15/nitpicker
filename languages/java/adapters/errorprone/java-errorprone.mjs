import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeReportPath } from '../../ingest/common.mjs';
import { ingestErrorProne } from '../../ingest/errorprone/errorprone.mjs';
import { isClassExempt } from './exemptions/class-exemptions.mjs';
import { isIntegrationTestName } from './exemptions/test-class-names.mjs';
import { isLombokGenerated } from './lombok/lombok-generated.mjs';
import { sourceReader } from './lombok/source-text.mjs';

const ERROR_PRONE_REPORT = 'errorprone.json';
const CHECKS = JSON.parse(
  readFileSync(new URL('../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
);

export function readErrorProneFindings({ reportRoot, roots, lintedRoots, manifest = {} }) {
  const reportPath = path.join(reportRoot, ERROR_PRONE_REPORT);
  if (!existsSync(reportPath)) {
    return [];
  }
  const testRoots = manifest.testSourceRoots ?? [];
  return ingestErrorProne(
    withoutExemptCode(readFileSync(reportPath, 'utf8'), sourceReader(reportRoot)),
    {
      resolvePath: (file) => lintedPath(file, roots, lintedRoots),
      guava: (file) => (inRoots(file, testRoots) ? manifest.testGuava : manifest.guava) !== false,
    },
  ).findings;
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
