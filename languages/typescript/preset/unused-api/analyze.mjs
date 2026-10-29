import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../typescript-api/typescript-api.mjs';
import { exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import { isReactProject } from '../eslint-config/scope-support.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { createContext, isTypeScriptFile } from './context.mjs';
import { unusedApiFindings } from './findings.mjs';
import { createProjectProgram } from './program.mjs';
import { collectReferences } from './references/references.mjs';
import { declaresCheckable } from './syntax/candidates.mjs';
import { collectTargets, registerWrapperAliases } from './syntax/declarations.mjs';
import { loadPackages } from './workspace/packages.mjs';

function parsedSource(projectRoot, file) {
  const fileName = path.join(projectRoot, file);
  return ts.createSourceFile(fileName, readFileSync(fileName, 'utf8'), ts.ScriptTarget.Latest);
}

function hasCheckableDeclarations({ projectRoot, layout, react }) {
  return layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isSourceFile(file) && isTypeScriptFile(file))
    .some((file) => declaresCheckable(parsedSource(projectRoot, file), react));
}

/**
 * Unused props of components (React scope only) and unused options of exported functions, from one
 * type-checked program over the project and its workspace siblings.
 */
export function analyzeUnusedApi({
  projectRoot,
  configPath,
  analyzerName,
  environment = process.env,
}) {
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
