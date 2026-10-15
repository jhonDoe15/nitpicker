import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUFF_CONFIG = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../ruff/nitpicker-ruff.toml',
);
