import { productionTypeResolver as untypedResolver } from '../production-types.mts';
import {
  fn as baseFn,
  wait as baseWait,
  type FileFacts,
  type FunctionFact,
  type WaitFact,
} from '../test-support/facts.mts';

type LooseParameter = { name: string; type: string; inlining?: string | undefined };

type WaitOverrides = Partial<WaitFact> & {
  outer?: Record<string, unknown>;
  lambda?: string;
  imported?: string;
};

type FunctionOverrides = Omit<Partial<FunctionFact>, 'parameters'> & {
  parameters?: LooseParameter[];
};

type ResolverInput = { files: FileFacts[]; projectRoot: string; javaRoots?: string[] };

export function wait(name: string, overrides: WaitOverrides = {}): WaitFact {
  return baseWait(name, overrides);
}

export function fn(name: string, overrides: FunctionOverrides = {}): FunctionFact {
  const { parameters, ...rest } = overrides;
  const base = baseFn(name, rest);
  return parameters === undefined ? base : Object.assign(base, { parameters });
}

export function productionTypeResolver(input: ResolverInput): unknown {
  const resolver: unknown = Reflect.apply(untypedResolver, undefined, [input]);
  return resolver;
}
