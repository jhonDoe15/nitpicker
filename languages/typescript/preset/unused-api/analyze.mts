import { readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import { createProjectProgram } from './program.mts';
import {
  type AnalysisLayout,
  collectReferences,
  collectTargets,
  createContext,
  declaresCheckable,
  exceptionMatcher,
  isReactProject,
  isTypeScriptFile,
  loadPackages,
  readHeadPolicy,
  readLayout,
  registerWrapperAliases,
  unusedApiFindings,
} from './typed/analysis-views.mts';

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
    .filter((file) => layout.isSourceFile(file) && isTypeScriptFile(file))
    .some((file) => declaresCheckable(parsedSource(projectRoot, file), react));
}

export function analyzeUnusedApi({
  projectRoot,
  configPath,
  analyzerName,
  environment = process.env,
}: {
  projectRoot: string;
  configPath: string;
  analyzerName: string;
  environment?: NodeJS.ProcessEnv;
}): Finding[] {
  const { exceptions, react: reactPolicy } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const react = isReactProject({ projectRoot, react: reactPolicy, javascript: layout.javascript });
  if (!hasCheckableDeclarations({ projectRoot, layout, react })) return [];
  const packagesInfo = loadPackages(projectRoot, layout);
  const program = createProjectProgram({ projectRoot, configPath, packagesInfo, layout });
  const context = { ...createContext({ program, projectRoot, layout, packagesInfo }), react };
  const registry = collectTargets(context);
  registerWrapperAliases(context, registry);
  collectReferences(context, registry);
  return unusedApiFindings(registry, {
    owned: context.owned,
    analyzerName,
    isExcepted: exceptionMatcher(exceptions),
  });
}
