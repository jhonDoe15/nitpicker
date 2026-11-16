import { fieldOf, textsOf } from '../../../../../shared/values/readers.mts';
import { nestFacts, routeFacts } from '../../../preset/eslint-plugin/rules/route-auth/handlers.mts';
import { parseProgram } from '../parsing/estree-program.mts';

type Evidence = {
  readonly shapes: ReadonlySet<string>;
  readonly isAuth: boolean;
  readonly isPublic: boolean;
};
type Counts = Readonly<Record<string, number>>;
type Sums = {
  h: number;
  a: number;
  p: number;
  g: number;
  readonly shapes: Map<string, { s: number; sp: number }>;
};

const MIN_HANDLERS = 10;
const MIN_FALLBACK_HANDLERS = 5;
const MIN_SHARE = 0.9;
const FRAMEWORKS = ['nest', 'route'];
const HINT = /@Controller|APP_GUARD|useGlobalGuards|forRoutes|express|fastify|koa|hono|restify/u;
const MAX_HANDLERS_PER_FILE = 400;
const MIN_TOP_SHARE = 0.5;

export const ROUTE_AUTH_CONVENTION = {
  id: 'typescript.routeAuth',
  label: 'Route auth requirement',
  kind: 'names',
  namesMeaning:
    'how routes declare their auth requirement: nest__<decorator>, nest__fallback or route__<middleware>',
  fallback: [],
  minFiles: MIN_HANDLERS,
  minUnit: 'handlers',
  files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
  scope: 'source',
  sampleLimit: 2000,
  measure: authEvidence,
  choose: followedAuth,
};

export function routeAuthEntries(conventions: object = {}): string[] {
  return textsOf(fieldOf(conventions, ROUTE_AUTH_CONVENTION.id));
}

function handlerEvidence(framework: string, handlers: readonly Evidence[]): string[] {
  return handlers.slice(0, MAX_HANDLERS_PER_FILE).flatMap((handler, index) => {
    const at = `#${String(index + 1)}`;
    return [
      `h:${framework}${at}`,
      ...(handler.isAuth ? [`a:${framework}${at}`] : []),
      ...(handler.isPublic ? [`p:${framework}${at}`] : []),
      ...[...handler.shapes].flatMap((shape) => [
        `s:${framework}:${shape}${at}`,
        ...(handler.isPublic ? [`sp:${framework}:${shape}${at}`] : []),
      ]),
    ];
  });
}

function authEvidence(text: string, file: string): string[] {
  const program = HINT.test(text) ? parseProgram(text, file) : undefined;
  if (program === undefined || program.ast === undefined) {
    return [];
  }
  const nest = nestFacts(program.ast, program.visitorKeys);
  const routes = routeFacts(program.ast, program.visitorKeys).routes;
  return [
    ...handlerEvidence('nest', nest.handlers),
    ...(nest.global ? ['g:nest'] : []),
    ...handlerEvidence('route', routes),
  ];
}

function addTotal(sums: Sums, kind: string | undefined, count: number): void {
  if (kind === 'h' || kind === 'a' || kind === 'p' || kind === 'g') {
    sums[kind] += count;
  }
}

function totals(counts: Counts, framework: string): Sums {
  const sums: Sums = { h: 0, a: 0, p: 0, g: 0, shapes: new Map() };
  for (const [key, count] of Object.entries(counts)) {
    const match = /^(h|a|p|g|s|sp):([a-z]+)(?::([^#]+))?(?:#\d+)?$/u.exec(key);
    if (match === null || match[2] !== framework) {
      continue;
    }
    const [, kind, , shape] = match;
    if (shape === undefined) {
      addTotal(sums, kind, count);
      continue;
    }
    const entry = sums.shapes.get(shape) ?? { s: 0, sp: 0 };
    if (kind === 's' || kind === 'sp') {
      entry[kind] += count;
    }
    sums.shapes.set(shape, entry);
  }
  return sums;
}

function followedFor(framework: string, counts: Counts): string[] {
  const sums = totals(counts, framework);
  if (sums.g > 0) {
    return [];
  }
  const shapes = [...sums.shapes];
  const best =
    shapes.length === 0
      ? undefined
      : shapes.reduce((top, entry) => (entry[1].s > top[1].s ? entry : top));
  const covered = best === undefined ? 0 : best[1].s + sums.p - best[1].sp;
  if (
    sums.h >= MIN_HANDLERS &&
    best !== undefined &&
    best[1].s / sums.h >= MIN_TOP_SHARE &&
    covered / sums.h >= MIN_SHARE
  ) {
    return [`${framework}__${best[0]}`];
  }
  const guardsMostly = framework === 'nest' && sums.a * 2 > sums.h;
  return guardsMostly && sums.h >= MIN_FALLBACK_HANDLERS ? ['nest__fallback'] : [];
}

function followedAuth(counts: Counts): string[] {
  return FRAMEWORKS.flatMap((framework) => followedFor(framework, counts));
}
