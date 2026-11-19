import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { callUntyped, type JavaPolicy } from '../typed/java-values.mts';
import { textsOf } from '../../../../shared/values/readers.mts';
import { kotlinFormatAdvice } from './style/kotlin-format-advice.mts';
import { kotlinGradleArguments, kotlinStyleFile, resolveKotlinTools } from './kotlin-tools.mts';

type KotlinRun = {
  readonly advice: unknown;
  readonly withArguments: <Result>(run: (args: string[]) => Result) => Result;
};

const trackPath: (file: string) => string = trackTemporaryPath;
const untrackPath: (file: string) => void = untrackTemporaryPath;

const STYLE_FILE = 'style.json';

function kotlinOptions(policy: JavaPolicy) {
  return {
    formatter: policy['kotlinFormatter'],
    detektConfig: policy['kotlinDetektConfig'],
    snapshot: policy.snapshot,
    conventions: policy.conventions,
    policyRoot: policy.policyRoot,
    toolPrecedence: policy['toolPrecedence'],
  };
}

function withStyleFile<Result>(style: unknown, use: (file: string | undefined) => Result): Result {
  if (style === undefined) {
    return use(undefined);
  }
  const directory = trackPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-')));
  try {
    const file = path.join(directory, STYLE_FILE);
    writeFileSync(file, JSON.stringify(style));
    return use(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    untrackPath(directory);
  }
}

export function resolveKotlinRun(
  projectRoot: string,
  policy: JavaPolicy = {},
): KotlinRun | undefined {
  if (policy.preset !== 'kotlin') {
    return undefined;
  }
  const options = kotlinOptions(policy);
  const tools = callUntyped(resolveKotlinTools, projectRoot, options);
  return {
    advice: callUntyped(kotlinFormatAdvice, tools),
    withArguments: (run) =>
      withStyleFile(callUntyped(kotlinStyleFile, tools, options.conventions ?? {}), (styleFile) =>
        run(
          textsOf(
            callUntyped(kotlinGradleArguments, projectRoot, { ...options, styleFile }, tools),
          ),
        ),
      ),
  };
}
