import { runJscpd } from '../../java/adapters/java-duplicates.mjs';
import { existingSourceRoots, NON_PRODUCTION_GLOBS } from './python-sources.mjs';

const DUPLICATES_FAILED_RULE = 'duplicates-failed';

export function runDuplicates(context) {
  try {
    runJscpd({
      cwd: context.projectRoot,
      roots: existingSourceRoots(context.projectRoot, context.project.sourceRoots),
      format: 'python',
      ignore: NON_PRODUCTION_GLOBS,
      reportRoot: context.reportRoot,
    });
  } catch (error) {
    throw Object.assign(new Error(error.message, { cause: error }), {
      rule: DUPLICATES_FAILED_RULE,
    });
  }
}
