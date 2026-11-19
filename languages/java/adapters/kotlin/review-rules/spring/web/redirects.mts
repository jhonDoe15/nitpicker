import { symbolOf } from '../spring-scopes.mts';
import {
  HTTP_HEADERS,
  REDIRECT_VIEW,
  RESPONSE_ENTITY,
  SERVLET_RESPONSES,
} from '../spring-types.mts';
import { requestFlow } from './requests/flow.mts';
import { judged, typed } from './requests/sinks.mts';
import type {
  Argument,
  InvocationFact,
  LocalFact,
  Read,
  Reported,
  SpringView,
} from '../typed/spring-shapes.mts';

type RedirectText = {
  scope: number;
  line: number;
  reads: Read[];
  holder?: LocalFact | undefined;
  name?: string | undefined;
};

const PREFIX = /^(?:redirect|forward):(?:(?:https?:)?\/\/?)?$/u;
const LOG_CALLS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'log']);
const HEADER_CALLS = new Set(['header', 'set', 'add', 'setHeader', 'addHeader']);
const LOCATION = /^(?:"location"|(?:[\p{L}_][\p{L}\p{N}_]*\.)*LOCATION)$/iu;
const ROOT = /^[\p{L}_][\p{L}\p{N}_]*/u;

function redirectRead(read: Read): boolean {
  return (
    (read.prefixes ?? []).some((prefix) => PREFIX.test(prefix)) &&
    !(read.calls ?? []).some((call) => LOG_CALLS.has(call))
  );
}

function redirectTexts(view: SpringView): RedirectText[] {
  const texts: { scope: number; line: number; reads?: Read[] | undefined; holder?: LocalFact }[] = [
    ...(view.file.returnValues ?? []),
    ...(view.file.locals ?? []).map((local) => ({ ...local, holder: local })),
    ...view.file.invocations
      .filter(({ name }) => !LOG_CALLS.has(name))
      .flatMap(({ scope, line, arguments: given }) =>
        given.map(({ reads }) => ({ scope, line, reads })),
      ),
  ];
  return texts
    .map(({ scope, line, holder, reads }) => ({
      scope,
      line,
      holder,
      reads: (reads ?? []).filter(redirectRead),
      name: undefined,
    }))
    .filter(({ reads }) => reads.length > 0);
}

function fromResponseEntity(view: SpringView, receiver: string | undefined): boolean {
  return view.is(ROOT.exec(receiver ?? '')?.[0], RESPONSE_ENTITY);
}

function redirectTarget(view: SpringView, invocation: InvocationFact): Argument | undefined {
  const { name, receiver, arguments: given } = invocation;
  if (receiver === undefined && view.is(name, REDIRECT_VIEW)) {
    return (
      given.find((argument) => argument.name === 'url') ??
      given.find((argument) => argument.name === undefined)
    );
  }
  if (
    (name === 'sendRedirect' && typed(view, invocation, SERVLET_RESPONSES)) ||
    (name === 'location' && invocation.assign !== true && fromResponseEntity(view, receiver)) ||
    (name === 'created' && view.is(receiver, RESPONSE_ENTITY)) ||
    ((name === 'location' || name === 'setLocation') && typed(view, invocation, HTTP_HEADERS))
  ) {
    return given[0];
  }
  return HEADER_CALLS.has(name) && given.length >= 2 && LOCATION.test(given[0]?.text ?? '')
    ? given[1]
    : undefined;
}

function redirectSinks(view: SpringView): RedirectText[] {
  return view.file.invocations.flatMap((invocation) => {
    const reads = redirectTarget(view, invocation)?.reads;
    return reads === undefined
      ? []
      : [{ scope: invocation.scope, line: invocation.line, reads, name: invocation.name }];
  });
}

function openRedirects(view: SpringView): Reported[] {
  const found = [...redirectTexts(view), ...redirectSinks(view)].filter(({ scope }) =>
    judged(view, scope),
  );
  if (found.length === 0) {
    return [];
  }
  const flow = requestFlow(view);
  const lines = new Set<number>();
  return found
    .filter(({ scope, line, reads, holder }) => flow.tainted(reads, scope, { line, holder }))
    .filter(({ line }) => {
      if (lines.has(line)) {
        return false;
      }
      lines.add(line);
      return true;
    })
    .map(({ scope, line, name }) => ({
      rule: 'SpringOpenRedirect',
      line,
      symbol: symbolOf(view, scope, name),
    }));
}

export const REDIRECT_RULE: (view: SpringView) => Reported[] = openRedirects;
