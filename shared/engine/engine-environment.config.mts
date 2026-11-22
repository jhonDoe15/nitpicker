import type { Environment } from '../processes/environment.mts';

export function engineEnvironment(variables: Environment = process.env): Environment {
  return variables;
}
