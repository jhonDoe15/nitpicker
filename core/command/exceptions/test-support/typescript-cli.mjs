import { readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { captureOutput } from '../../../diff/reporting/test-support/output-capture.mjs';
import { withoutHelpUris } from '../../../diff/reporting/test-support/report-reading.mjs';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';

const COMPARISON_BASE_REF = 'comparison-base';

function readReport(reports, name) {
  const file = path.resolve(reports, name);
  if (!file.startsWith(reports + path.sep)) {
    throw new Error(`report outside the output folder: ${name}`);
  }
  return withoutHelpUris(JSON.parse(readFileSync(file, 'utf8')));
}

export function useTypescriptCli(runCli) {
  const git = useGitFixtures();

  function typescriptRepository(files) {
    const { root } = git.createGitRepository(
      {
        '.gitignore': 'node_modules/\n',
        'package.json': '{"name":"fixture","type":"module"}\n',
        ...files,
      },
      { prefix: 'nitpicker-typescript-cli-', baseRef: COMPARISON_BASE_REF },
    );
    symlinkSync(
      path.join(import.meta.dirname, '../../../../node_modules'),
      path.join(root, 'node_modules'),
      'dir',
    );
    return root;
  }

  function runTypescript(root, analyzers) {
    const reports = path.join(git.temporaryRoot('nitpicker-typescript-out-'), 'reports');
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [
        '--base',
        COMPARISON_BASE_REF,
        '--output',
        reports,
        ...analyzers.flatMap((name) => ['--analyzer', name]),
      ],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: output.stdout,
      stderr: output.stderr,
      progress: { write: () => undefined },
    });
    return {
      exitCode,
      json: (name) => readReport(reports, name),
      text: output.stdoutText + output.stderrText,
    };
  }

  return { typescriptRepository, runTypescript };
}
