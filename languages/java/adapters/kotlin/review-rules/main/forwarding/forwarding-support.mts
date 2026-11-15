import { argument, parameter } from '../../test-support/loose-facts.mts';
import type { Loose } from '../../test-support/loose-facts.mts';

export function forward(name: string, args: string[], overrides: Loose = {}): Loose {
  return {
    name,
    qualifier: undefined,
    typeArguments: false,
    arguments: args.map((text) => argument(text)),
    ...overrides,
  };
}

export function params(...names: string[]): Loose[] {
  return names.map((name) => parameter(name, 'Int'));
}
