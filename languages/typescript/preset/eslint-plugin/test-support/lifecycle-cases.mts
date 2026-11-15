export type Build = (body: string) => { filename: string; code: string };

export const filename = '/repo/src/main/features/a/adapters/x.ts';

export function inClass(body: string): { filename: string; code: string } {
  return { filename, code: `class Client { ${body} }` };
}

export function factory(body: string): { filename: string; code: string } {
  return { filename, code: `function createClient() { ${body} }` };
}
