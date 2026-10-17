import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdClones } from '../../../../core/tooling/jscpd-clones.mjs';
import {
  DUPLICATES_REPORT,
  duplicateFindings,
  runJscpd,
} from '../../../java/adapters/metrics/java-duplicates.mjs';
import { isGeneratedPython } from '../../libraries/generated-files.mjs';
import { existingSourceRoots, nonProductionGlobs, pythonSourceFiles } from './python-sources.mjs';

const DUPLICATES_FAILED_RULE = 'duplicates-failed';
const IMPORT_LINE = /^\s*(?:import\s|from\s+\S+\s+import\b)/;
const IMPORT_CONTINUATION = /^\s*(?:[\w.*]+(?:\s+as\s+\w+)?\s*(?:,\s*\)?|\))|\))\s*$/;
const BLANK_OR_COMMENT = /^\s*(?:#.*)?$/;
const ALL_START = /^\s*__all__\s*[+]?=\s*[[(]/;
const ALL_END = /[\])]\s*$/;

export function runDuplicates(context) {
  try {
    runJscpd({
      cwd: context.projectRoot,
      roots: existingSourceRoots(context.projectRoot, context.project.sourceRoots),
      format: 'python',
      ignore: nonProductionGlobs(context.project.sourceRoots, context.projectRoot),
      reportRoot: context.reportRoot,
      together: true,
      renamed: {
        syntax: 'python',
        files: pythonSourceFiles(context.projectRoot, context.project.sourceRoots).filter(
          (file) => !isGeneratedPython(context.projectRoot, file),
        ),
      },
    });
  } catch (error) {
    throw Object.assign(new Error(error.message, { cause: error }), {
      rule: DUPLICATES_FAILED_RULE,
    });
  }
}

export function importsOnly(fragment) {
  let open = false;
  let exporting = false;
  return fragment.split('\n').every((line) => {
    if (exporting) {
      exporting = !ALL_END.test(line);
      return true;
    }
    if (ALL_START.test(line)) {
      exporting = !ALL_END.test(line);
      return true;
    }
    if (open || IMPORT_LINE.test(line)) {
      open = (open || line.includes('(')) && !line.includes(')');
      return true;
    }
    return BLANK_OR_COMMENT.test(line) || IMPORT_CONTINUATION.test(line);
  });
}

export function readDuplicateFindings(reportRoot, projectRoot) {
  const { runs } = JSON.parse(readFileSync(path.join(reportRoot, DUPLICATES_REPORT), 'utf8'));
  const clones = runs
    .flatMap(({ root, report }) => jscpdClones(report, [root]))
    .filter((clone) => !importsOnly(clone.fragment ?? ''));
  return duplicateFindings(clones, {
    reportRoot,
    reportFile: DUPLICATES_REPORT,
    projectRoot,
    syntax: 'python',
  });
}
