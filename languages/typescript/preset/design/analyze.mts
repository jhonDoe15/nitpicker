import type { Finding } from '../../../../shared/values/findings.mts';
import type { DesignFacts } from './design-types.mts';
import { takeProjectProgram } from '../unused-api/program.mts';
import { type TypedPlan, engineAnswer, runTypedPlan } from '../unused-api/engine/typed-plans.mts';
import {
  DESIGN_RULES,
  createContext,
  loadPackages,
  readHeadPolicy,
  readLayout,
  sharedFactFindings,
} from './typed/views.mts';
import { engineDesignPart } from './engine/engine-facts.mts';
import { designFacts } from './facts.mts';

type Request = { projectRoot: string; configPath: string; environment: NodeJS.ProcessEnv };

function designFactsPlan({
  projectRoot,
  configPath,
  environment,
}: Request): TypedPlan<DesignFacts> {
  const layout = readLayout(environment);
  const packagesInfo = loadPackages(projectRoot, layout);
  const frameworks = readHeadPolicy(environment).frameworks;
  const request = { projectRoot, configPath, packagesInfo, layout };
  const engine = engineDesignPart({ ...request, frameworks, environment });
  return {
    part: engine?.part,
    finish(result) {
      const fromEngine = engineAnswer(engine, result);
      if (fromEngine !== undefined) {
        return fromEngine;
      }
      const program = takeProjectProgram(request);
      const context = createContext({ program, projectRoot, layout, packagesInfo });
      return designFacts({ context, layout, packagesInfo, frameworks, projectRoot });
    },
  };
}

export function projectDesignFacts(request: Request): DesignFacts {
  return runTypedPlan(designFactsPlan(request), request.environment);
}

export function designPlan(request: Request & { analyzerName: string }): TypedPlan<Finding[]> {
  const facts = designFactsPlan(request);
  const layout = readLayout(request.environment);
  return {
    part: facts.part,
    finish: (result) =>
      sharedFactFindings(facts.finish(result), {
        language: layout.javascript ? 'javascript' : 'typescript',
        analyzerName: request.analyzerName,
        policy: readHeadPolicy(request.environment),
        rules: DESIGN_RULES,
      }),
  };
}

export function analyzeDesignSignals(request: Request & { analyzerName: string }): Finding[] {
  return runTypedPlan(designPlan(request), request.environment);
}
