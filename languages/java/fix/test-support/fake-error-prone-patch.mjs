import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SETTINGS = '-Pnitpicker.errorprone.settings=';
const REPORT_DIR = '-Pnitpicker.reportDir=';

function argumentOf(args, prefix) {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function patchFlagsOf(invocation) {
  const file = argumentOf(invocation.args, SETTINGS);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function patchChecksOf({ flags }) {
  const flag = flags.find((entry) => entry.startsWith('-XepPatchChecks:'));
  return flag.slice('-XepPatchChecks:'.length).split(',');
}

export function fakeErrorPronePatch({ patch, diagnostics = () => [] }) {
  return { gradle: gradleRun, maven: { patch, diagnostics } };

  function gradleRun(invocation) {
    const flags = patchFlagsOf(invocation);
    const checks = patchChecksOf({ flags });
    const location = flags
      .find((entry) => entry.startsWith('-XepPatchLocation:'))
      .slice('-XepPatchLocation:'.length);
    const reports = argumentOf(invocation.args, REPORT_DIR);
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
