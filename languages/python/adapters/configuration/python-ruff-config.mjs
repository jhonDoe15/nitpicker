import path from 'node:path';

export const RUFF_CONFIG = path.resolve(
  new URL('../', import.meta.url).pathname,
  '../ruff/nitpicker-ruff.toml',
);
