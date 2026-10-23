import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import { DESIGN_RULES } from '../../../../shared/project-rules/design/design-rules.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { createContext } from '../unused-api/context.mjs';
import { createProjectProgram } from '../unused-api/program.mjs';
import { loadPackages } from '../unused-api/workspace/packages.mjs';
import { designFacts } from './facts.mjs';

function headPolicy(environment) {
  const protocols = readHeadPolicyFile(environment).protocols;
  return { ...readHeadPolicy(environment), ...(protocols === undefined ? {} : { protocols }) };
}

/** The design facts of the project: one type-checked program over its production sources. */
export function projectDesignFacts({ projectRoot, configPath, environment }) {
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

/** The deep-module design rules over the facts of the project's production sources. */
export function analyzeDesignSignals({ projectRoot, configPath, analyzerName, environment }) {
  const layout = readLayout(environment);
  return sharedFactFindings(projectDesignFacts({ projectRoot, configPath, environment }), {
    language: layout.javascript ? 'javascript' : 'typescript',
    analyzerName,
    policy: headPolicy(environment),
    rules: DESIGN_RULES,
  });
}
