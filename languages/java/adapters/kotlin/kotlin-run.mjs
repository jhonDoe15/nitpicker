import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { kotlinFormatAdvice } from './style/kotlin-format-advice.mjs';
import { kotlinGradleArguments, kotlinStyleFile, resolveKotlinTools } from './kotlin-tools.mjs';

const STYLE_FILE = 'style.json';

function kotlinOptions(policy) {
  return {
    formatter: policy.kotlinFormatter,
    detektConfig: policy.kotlinDetektConfig,
    snapshot: policy.snapshot,
    conventions: policy.conventions,
    policyRoot: policy.policyRoot,
    toolPrecedence: policy.toolPrecedence,
  };
}

function withStyleFile(style, use) {
  if (style === undefined) {
    return use(undefined);
  }
  const directory = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-')));
  try {
    const file = path.join(directory, STYLE_FILE);
    writeFileSync(file, JSON.stringify(style));
    return use(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}

export function resolveKotlinRun(projectRoot, policy = {}) {
  if (policy.preset !== 'kotlin') {
    return undefined;
  }
  const options = kotlinOptions(policy);
  const tools = resolveKotlinTools(projectRoot, options);
  return {
    advice: kotlinFormatAdvice(tools),
    withArguments: (run) =>
      withStyleFile(kotlinStyleFile(tools, options.conventions ?? {}), (styleFile) =>
        run(kotlinGradleArguments(projectRoot, { ...options, styleFile }, tools)),
      ),
  };
}
