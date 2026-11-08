import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { cruise as runDependencyCruiser } from 'dependency-cruiser';
import { linkPolicyFile } from '../../../../../core/tooling/policy-links.mjs';
import { readLayout } from '../../head-policy.mjs';
import { layoutTransformFor } from '../../tool-configs.mjs';
import {
  EXCLUDED_PATH_PATTERN,
  POLICY_TYPESCRIPT_CONFIG,
  TYPESCRIPT_CONFIG_ENVIRONMENT,
} from '../cruise.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../../../../..');

async function importConfigWithPlaceholderTypeScriptConfig() {
  const previous = process.env[TYPESCRIPT_CONFIG_ENVIRONMENT];
  process.env[TYPESCRIPT_CONFIG_ENVIRONMENT] = path.join(projectRoot, POLICY_TYPESCRIPT_CONFIG);
  try {
    const { default: config } = await import('../dependency-cruiser.config.mjs');
    return config;
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(process.env, TYPESCRIPT_CONFIG_ENVIRONMENT);
    } else {
      process.env[TYPESCRIPT_CONFIG_ENVIRONMENT] = previous;
    }
  }
}

function parseTypeScriptConfig(fileName) {
  return ts.parseJsonConfigFileContent(
    ts.readConfigFile(fileName, (file) => ts.sys.readFile(file)).config,
    ts.sys,
    path.dirname(fileName),
    {},
    fileName,
  );
}

function cruiseOptions(ruleSet) {
  return {
    ruleSet,
    validate: true,
    outputType: 'json',
    exclude: {
      path: [EXCLUDED_PATH_PATTERN, readLayout().excludePattern]
        .filter((pattern) => pattern !== undefined)
        .join('|'),
    },
  };
}

function graphOf(report) {
  const output = typeof report.output === 'string' ? report.output : JSON.stringify(report.output);
  if (report.exitCode !== 0) {
    throw new Error(`dependency-cruiser failed with exit ${String(report.exitCode)}:\n${output}`);
  }
  const graph = JSON.parse(output);
  if (!Array.isArray(graph.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

export async function cruiseInProcess(paths, { typeScriptRoot = projectRoot } = {}) {
  if (paths.length === 0) return { modules: [] };
  const config = await importConfigWithPlaceholderTypeScriptConfig();
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
      cruiseOptions(ruleSet),
      {},
      { tsConfig, babelConfig: {} },
    );
    return graphOf(report);
  } finally {
    linkedConfig.remove();
  }
}
