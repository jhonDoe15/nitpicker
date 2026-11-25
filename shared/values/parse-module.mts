import { createRequire } from 'node:module';
import { fieldOf } from './readers.mts';

export function parseWithModule(name: string, text: string): unknown {
  const parser: unknown = createRequire(import.meta.url)(name);
  const parse = fieldOf(parser, 'parse');
  if (typeof parse !== 'function') {
    throw new TypeError(`${name} has no parse function`);
  }
  return Reflect.apply(parse, parser, [text]);
}
