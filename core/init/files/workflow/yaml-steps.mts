import path from 'node:path';

const STEP = '      - ';
export const DETAIL = '        ';
const PLAIN_SCALAR = /^[A-Za-z_/.][\w@/.=,' <>+-]*$/u;

export type StepSettings = Readonly<Record<string, unknown>>;

export function yamlScalar(value: unknown): unknown {
  return typeof value === 'string' && !PLAIN_SCALAR.test(value) ? JSON.stringify(value) : value;
}

export function step(uses: string, settings: StepSettings = {}): string[] {
  const entries = Object.entries(settings);
  return [
    `${STEP}uses: ${uses}`,
    ...(entries.length === 0 ? [] : [`${DETAIL}with:`]),
    ...entries.map(([key, value]) => `${DETAIL}  ${key}: ${String(yamlScalar(value))}`),
  ];
}

export function run(command: string): string[] {
  return [`${STEP}run: ${String(yamlScalar(command))}`];
}

export function repositoryPath(repository: string, file: string): string {
  return path.relative(repository, file).split(path.sep).join('/');
}
