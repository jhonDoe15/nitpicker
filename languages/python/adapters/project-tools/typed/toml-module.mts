import { createRequire } from 'node:module';
import { fieldOf } from '../../../../../shared/values/readers.mts';

function tomlFunction(name: string): (...args: unknown[]) => unknown {
  const toml: unknown = createRequire(import.meta.url)('smol-toml');
  const found = fieldOf(toml, name);
  if (typeof found !== 'function') {
    throw new TypeError(`smol-toml has no ${name}`);
  }
  return (...args) => {
    const result: unknown = Reflect.apply(found, toml, args);
    return result;
  };
}

export function parseTomlText(text: string): unknown {
  return tomlFunction('parse')(text);
}

export function stringifyTomlValue(value: unknown): unknown {
  return tomlFunction('stringify')(value);
}
