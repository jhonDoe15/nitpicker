import path from 'node:path';
import ts from 'typescript';
import { cruise as runDependencyCruiser } from 'dependency-cruiser';
import { linkPolicyFile } from '../../../../../core/tooling/policy-links.mjs';
import { readLayout } from '../../head-policy.mjs';
import { layoutTransformFor } from '../../tool-configs.mjs';
import {
  EXCLUDED_PATH_PATTERN,
  POLICY_TYPESCRIPT_CONFIG,
  TYPESCRIPT_CONFIG_ENVIRONMENT,
} from '../cruise.mjs';

// The same graph as `cruise()` in ../cruise.mjs, run in the test process through dependency-cruiser's
// JS API instead of one `dependency-cruise` CLI process per call. The CLI process re-imports
// typescript and dependency-cruiser every time, which dominated each call. The rule set, the
// exclusion pattern, the policy tsconfig link and the JSON output are the ones `cruise()` uses.

const projectRoot = path.resolve(import.meta.dirname, '../../../../..');

// `../config.mjs` reads the policy tsconfig path from the environment when it is first imported. The
// tsconfig used for each call is the linked one passed below, so the imported path is only a placeholder.
const previousEnvironment = process.env[TYPESCRIPT_CONFIG_ENVIRONMENT];
process.env[TYPESCRIPT_CONFIG_ENVIRONMENT] = path.join(projectRoot, POLICY_TYPESCRIPT_CONFIG);
const { default: config } = await import('../config.mjs');
if (previousEnvironment === undefined) {
  delete process.env[TYPESCRIPT_CONFIG_ENVIRONMENT];
} else {
  process.env[TYPESCRIPT_CONFIG_ENVIRONMENT] = previousEnvironment;
}

/**
 * Same contract as `cruise(paths, { typeScriptRoot })`: returns the dependency-cruiser JSON graph,
 * and throws when the run fails or does not produce a modules array.
 */
export async function cruiseInProcess(paths, { typeScriptRoot = projectRoot } = {}) {
  if (paths.length === 0) return { modules: [] };
  const linkedConfig = linkPolicyFile(
    path.join(projectRoot, POLICY_TYPESCRIPT_CONFIG),
    path.join(
      path.resolve(projectRoot, typeScriptRoot),
      `.nitpicker-dependency-graph-${String(process.pid)}-tsconfig.json`,
    ),
    layoutTransformFor(POLICY_TYPESCRIPT_CONFIG, readLayout()),
  );
  try {
    const ruleSet = structuredClone(config);
    ruleSet.options.baseDir = projectRoot;
    ruleSet.options.tsConfig.fileName = linkedConfig.targetPath;
    const tsConfig = parseTypeScriptConfig(linkedConfig.targetPath);
    const report = await runDependencyCruiser(
      paths.map((value) => path.resolve(projectRoot, value)),
      {
        ruleSet,
        validate: true,
        outputType: 'json',
        exclude: {
          path: [EXCLUDED_PATH_PATTERN, readLayout().excludePattern]
            .filter((pattern) => pattern !== undefined)
            .join('|'),
        },
      },
      {},
      { tsConfig, babelConfig: {} },
    );
    if (report.exitCode !== 0) {
      throw new Error(
        `dependency-cruiser failed with exit ${String(report.exitCode)}:\n${report.output}`,
      );
    }
    const graph = JSON.parse(report.output);
    if (!Array.isArray(graph.modules)) {
      throw new TypeError('dependency-cruiser report is missing its modules array');
    }
    return graph;
  } finally {
    linkedConfig.remove();
  }
}

function parseTypeScriptConfig(fileName) {
  return ts.parseJsonConfigFileContent(
    ts.readConfigFile(fileName, ts.sys.readFile).config,
    ts.sys,
    path.dirname(fileName),
    {},
    fileName,
  );
}
