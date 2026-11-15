import type TypeScript from 'typescript';

export function isTypeScriptApi(value: unknown): value is typeof TypeScript {
  return typeof value === 'object' && value !== null && 'createSourceFile' in value;
}
