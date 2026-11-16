import type { Finding } from '../../../../shared/values/findings.mts';
import type { DesignFacts } from './design-types.mts';
import { createProjectProgram } from '../unused-api/program.mts';
import {
  DESIGN_RULES,
  createContext,
  loadPackages,
  readHeadPolicy,
  readLayout,
  sharedFactFindings,
} from './typed/views.mts';
import { designFacts } from './facts.mts';

type Request = { projectRoot: string; configPath: string; environment: NodeJS.ProcessEnv };

export function projectDesignFacts({ projectRoot, configPath, environment }: Request): DesignFacts {
  const layout = readLayout(environment);
  const packagesInfo = loadPackages(projectRoot, layout);
  const program = createProjectProgram({
    projectRoot,
    configPath,
    packagesInfo,
    layout,
    withoutTests: true,
  });
  const context = createContext({ program, projectRoot, layout, packagesInfo });
  const frameworks = readHeadPolicy(environment).frameworks;
  return designFacts({ context, layout, packagesInfo, frameworks, projectRoot });
}

export function analyzeDesignSignals({
  projectRoot,
  configPath,
  analyzerName,
  environment,
}: Request & { analyzerName: string }): Finding[] {
  const layout = readLayout(environment);
  return sharedFactFindings(projectDesignFacts({ projectRoot, configPath, environment }), {
    language: layout.javascript ? 'javascript' : 'typescript',
    analyzerName,
    policy: readHeadPolicy(environment),
    rules: DESIGN_RULES,
  });
}
