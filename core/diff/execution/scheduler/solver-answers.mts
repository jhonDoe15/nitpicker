import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackTemporaryPath } from '../../../tooling/temporary-files.mts';
import { SOLVER_ANSWERS_ENVIRONMENT } from '../../../../shared/solver-answers/answer-store.mts';

const trackPath: (filePath: string) => string = trackTemporaryPath;

/**
 * The environment that names the folder of solver answers of this process's runs, made on first
 * use and removed when the process ends. Every scheduler run of the process gets the same folder,
 * so the head snapshot of a comparison reads the answers the base snapshot found.
 */
export function solverAnswersOnce(): () => NodeJS.ProcessEnv {
  const folders: string[] = [];
  return () => {
    const [folder = trackPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-solver-')))] = folders;
    if (folders.length === 0) {
      folders.push(folder);
    }
    return { [SOLVER_ANSWERS_ENVIRONMENT]: folder };
  };
}
