import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { scanImports } from '../../analysis/python-coupling.mjs';
import { run } from '../../execution/python-process.mjs';
import { createToolContext } from '../../test-support/typed/tool-context.mts';

type ScannedProject = {
  readonly context: ReturnType<typeof createToolContext>;
  readonly reportRoot: string;
};

export function useScannedProjects(): (files: Readonly<Record<string, string>>) => ScannedProject {
  const { temporaryRoot } = useGitFixtures();

  return function scannedProject(files) {
    const root = temporaryRoot('nitpicker-scan-');
    const reportRoot = temporaryRoot('nitpicker-scan-report-');
    writeFiles(root, files);
    const context = createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings: { environment: 'path', sourceRoots: ['src'] },
      reportRoot,
    });
    scanImports(context, run);
    return { context, reportRoot };
  };
}
