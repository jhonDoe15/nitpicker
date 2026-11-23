import type { EngineEnvironment as Environment } from './engine-run.mts';

export function engineEnvironment(variables: Environment = process.env): Environment {
  return variables;
}
