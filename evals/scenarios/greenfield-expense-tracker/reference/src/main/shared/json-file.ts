import type { z } from 'zod';
import type { TextFiles } from './text-files.js';

class JsonFileError extends Error {}

export async function readJsonFile<Schema extends z.ZodType>(
  files: TextFiles,
  path: string,
  schema: Schema,
): Promise<z.output<Schema> | undefined> {
  const text = await files.readText(path);
  if (text === undefined) {
    return undefined;
  }
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    throw new JsonFileError(`Cannot read ${path}`, { cause: error });
  }
}

export async function writeJsonFile(files: TextFiles, path: string, value: unknown): Promise<void> {
  await files.writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}
