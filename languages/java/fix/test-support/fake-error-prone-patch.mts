import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { requiredOption } from './fake-maven-patch.mts';
import type { FakeInvocation, PatchHooks, Reply } from './fake-maven-patch.mts';

const SETTINGS = '-Pnitpicker.errorprone.settings=';
const REPORT_DIR = '-Pnitpicker.reportDir=';
const LOCATION = '-XepPatchLocation:';
const CHECKS = '-XepPatchChecks:';

type Options = {
  readonly patch: PatchHooks['patch'];
  readonly diagnostics?: PatchHooks['diagnostics'];
};

function patchFlagsOf(invocation: FakeInvocation): string[] {
  return textsOf(parseJson(readFileSync(requiredOption(invocation.args, SETTINGS), 'utf8')));
}

export function patchChecksOf({ flags }: { readonly flags: readonly string[] }): string[] {
  return requiredOption(flags, CHECKS).split(',');
}

export function fakeErrorPronePatch({ patch, diagnostics = () => [] }: Options): {
  readonly gradle: (invocation: FakeInvocation) => Reply;
  readonly maven: PatchHooks;
} {
  return { gradle: gradleRun, maven: { patch, diagnostics } };

  function gradleRun(invocation: FakeInvocation): Reply {
    const flags = patchFlagsOf(invocation);
    const checks = patchChecksOf({ flags });
    const location = requiredOption(flags, LOCATION);
    const reports = requiredOption(invocation.args, REPORT_DIR);
    const directory = path.join(location, 'abc123');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, 'error-prone.patch'),
      patch(invocation.cwd, directory, checks),
    );
    mkdirSync(path.join(reports, 'module'), { recursive: true });
    writeFileSync(
      path.join(reports, 'module', 'errorprone.json'),
      JSON.stringify(
        diagnostics(invocation.cwd).filter(({ message }) =>
          checks.some((check) => message.startsWith(`[${check}]`)),
        ),
      ),
    );
    return { status: 0, stdout: '', stderr: '' };
  }
}
