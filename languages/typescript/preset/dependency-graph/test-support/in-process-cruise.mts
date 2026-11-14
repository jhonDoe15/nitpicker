import path from 'node:path';
import { cruise as runDependencyCruiser, type ICruiseResult } from 'dependency-cruiser';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { readLayout as untypedReadLayout } from '../../head-policy.mjs';
import { linkPolicyFile as untypedLinkPolicyFile } from '../../../../../core/tooling/policy-links.mjs';
import {
  EXCLUDED_PATH_PATTERN,
  POLICY_TYPESCRIPT_CONFIG,
  TYPESCRIPT_CONFIG_ENVIRONMENT,
  dependencyGraphTsconfig as untypedDependencyGraphTsconfig,
} from '../cruise.mjs';
import type { Layout } from '../../../adapters/typed/head-policy.mts';

const ts = typescriptApi();

const readLayout: () => Layout & { readonly excludePattern?: string | undefined } =
  untypedReadLayout;

const linkPolicyFile: (
  source: string,
  target: string,
  transform: (text: string, targetPath: string) => string,
) => { readonly targetPath: string; readonly remove: () => void } = untypedLinkPolicyFile;

const dependencyGraphTsconfig: (layout: Layout) => (text: string, targetPath: string) => string =
  untypedDependencyGraphTsconfig;

const projectRoot = path.resolve(import.meta.dirname, '../../../../..');

async function importConfigWithPlaceholderTypeScriptConfig() {
  const previous = process.env[TYPESCRIPT_CONFIG_ENVIRONMENT];
  process.env[TYPESCRIPT_CONFIG_ENVIRONMENT] = path.join(projectRoot, POLICY_TYPESCRIPT_CONFIG);
  try {
    const { default: config } = await import('../dependency-cruiser.config.mts');
    return config;
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(process.env, TYPESCRIPT_CONFIG_ENVIRONMENT);
    } else {
      process.env[TYPESCRIPT_CONFIG_ENVIRONMENT] = previous;
    }
  }
}

function parseTypeScriptConfig(fileName: string) {
  return ts.parseJsonConfigFileContent(
    ts.readConfigFile(fileName, (file) => ts.sys.readFile(file)).config,
    ts.sys,
    path.dirname(fileName),
    {},
    fileName,
  );
}

function cruiseOptions(ruleSet: object) {
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

function isGraph(value: unknown): value is ICruiseResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'modules' in value &&
    Array.isArray(value.modules)
  );
}

function graphOf(report: { readonly output: unknown; readonly exitCode: number }): ICruiseResult {
  const output = typeof report.output === 'string' ? report.output : JSON.stringify(report.output);
  if (report.exitCode !== 0) {
    throw new Error(`dependency-cruiser failed with exit ${String(report.exitCode)}:\n${output}`);
  }
  const graph: unknown = JSON.parse(output);
  if (!isGraph(graph)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return graph;
}

export async function cruiseInProcess(
  paths: readonly string[],
  { typeScriptRoot = projectRoot }: { readonly typeScriptRoot?: string } = {},
): Promise<ICruiseResult | { readonly modules: [] }> {
  if (paths.length === 0) {
    return { modules: [] };
  }
  const config = await importConfigWithPlaceholderTypeScriptConfig();
  const linkedConfig = linkPolicyFile(
    path.join(projectRoot, POLICY_TYPESCRIPT_CONFIG),
    path.join(
      path.resolve(projectRoot, typeScriptRoot),
      `.nitpicker-dependency-graph-${String(process.pid)}-tsconfig.json`,
    ),
    dependencyGraphTsconfig(readLayout()),
  );
  try {
    const ruleSet = {
      ...structuredClone(config),
      options: {
        ...structuredClone(config.options),
        baseDir: projectRoot,
        tsConfig: { fileName: linkedConfig.targetPath },
      },
    };
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
