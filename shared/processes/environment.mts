import { tmpdir } from 'node:os';
import path from 'node:path';

export type Environment = Readonly<Record<string, string | undefined>>;

export function withCompileCache(environment: Environment | undefined): Environment {
  return {
    NODE_COMPILE_CACHE: path.join(tmpdir(), 'nitpicker-node-compile-cache'),
    ...environment,
  };
}
