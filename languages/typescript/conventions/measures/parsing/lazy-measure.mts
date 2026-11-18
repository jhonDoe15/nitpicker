import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl as untypedCheckoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { cachedValue } from '../../../../../shared/values/caching/cached-value.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

export type Measure = (text: string, file: string) => string[];

export const checkoutModuleUrl: (url: URL) => URL = untypedCheckoutModuleUrl;
const load = createRequire(import.meta.url);
const measures = new Map<string, Measure>();

function isMeasure(value: unknown): value is Measure {
  return typeof value === 'function';
}

function loadedMeasure(path: string, name: string): Measure {
  const measure = fieldOf(load(path), name);
  if (!isMeasure(measure)) {
    throw new TypeError(`${path} does not export the measure ${name}`);
  }
  return measure;
}

export function lazyMeasure(moduleUrl: URL, name: string): Measure {
  const path = fileURLToPath(moduleUrl);
  return (text, file) =>
    cachedValue(measures, `${path}#${name}`, () => loadedMeasure(path, name))(text, file);
}
