import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import { engineRegistryPart } from './engine/engine-registry.mts';
import { type TypedPlan, engineAnswer, runTypedPlan } from './engine/typed-plans.mts';
import { registryData } from './engine/registry-data.mts';
import { type ProgramRequest, createProjectProgram } from './program.mts';
import {
  type AnalysisLayout,
  collectReferences,
  collectTargets,
  createContext,
  declaresCheckable,
  exceptionMatcher,
  isReactProject,
  isAnalyzedFile,
  loadPackages,
  readHeadPolicy,
  readLayout,
  registerWrapperAliases,
  registryDataFindings,
} from './analysis-views.mts';

const ts = typescriptApi();

function parsedSource(projectRoot: string, file: string): TypeScript.SourceFile {
  const fileName = path.join(projectRoot, file);
  return ts.createSourceFile(fileName, readFileSync(fileName, 'utf8'), ts.ScriptTarget.Latest);
}

function hasCheckableDeclarations({
  projectRoot,
  layout,
  react,
}: {
  projectRoot: string;
  layout: AnalysisLayout;
  react: boolean;
}): boolean {
  return layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isSourceFile(file) && isAnalyzedFile(file, layout))
    .some((file) => declaresCheckable(parsedSource(projectRoot, file), react));
}

function nodeRegistry(request: ProgramRequest & { layout: AnalysisLayout }, react: boolean) {
  const program = createProjectProgram(request);
  const context = { ...createContext({ ...request, program }), react };
  const registry = collectTargets(context);
  registerWrapperAliases(context, registry);
  collectReferences(context, registry);
  return { registry: registryData(registry), owned: context.owned };
}

type Request = {
  projectRoot: string;
  configPath: string;
  analyzerName: string;
  environment: NodeJS.ProcessEnv;
};

export function unusedApiPlan({
  projectRoot,
  configPath,
  analyzerName,
  environment,
}: Request): TypedPlan<Finding[]> {
  const { exceptions, react: reactPolicy } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const reactEnabled = reactPolicy.enabled;
  const react =
    !layout.javascript &&
    isReactProject({
      projectRoot,
      react: typeof reactEnabled === 'boolean' ? { enabled: reactEnabled } : {},
    });
  if (!hasCheckableDeclarations({ projectRoot, layout, react })) {
    return { finish: () => [] };
  }
  const packagesInfo = loadPackages(projectRoot, layout);
  const request = { projectRoot, configPath, packagesInfo, layout };
  const engine = engineRegistryPart({ ...request, react, environment });
  return {
    part: engine?.part,
    finish(result) {
      const { registry, owned } = engineAnswer(engine, result) ?? nodeRegistry(request, react);
      return registryDataFindings(registry, {
        owned,
        analyzerName,
        isExcepted: exceptionMatcher(exceptions),
      });
    },
  };
}

export function analyzeUnusedApi(request: Request): Finding[] {
  return runTypedPlan(unusedApiPlan(request), request.environment);
}
