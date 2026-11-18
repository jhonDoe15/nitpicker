import { nestFacts, routeFacts } from '../../../preset/eslint-plugin/rules/route-auth/handlers.mts';
import { parseProgram } from '../parsing/estree-program.mts';

type Evidence = {
  readonly shapes: ReadonlySet<string>;
  readonly isAuth: boolean;
  readonly isPublic: boolean;
};

const HINT = /@Controller|APP_GUARD|useGlobalGuards|forRoutes|express|fastify|koa|hono|restify/u;
const MAX_HANDLERS_PER_FILE = 400;

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

export function authEvidence(text: string, file: string): string[] {
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
