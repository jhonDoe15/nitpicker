import {
  DEFAULT_CRAP_SCORE_LIMIT,
  GREW_MESSAGES,
  HELD_MESSAGES,
  MESSAGES,
  RULE_IDS,
  messageFields,
  renderMessage,
} from '../policy.mts';
import { allowedFormField, definedField } from '../messages/messages.mts';
import type { Finding } from '../values/findings.mts';
import { textOf } from '../values/readers.mts';
import { locationFrom } from './finding-parts.mts';
import { exceptionRoute, normalizeFunctionName } from '../exceptions/rule-names.mts';

type CrapFunction = {
  readonly name?: unknown;
  readonly path?: unknown;
  readonly identity?: unknown;
  readonly crap?: unknown;
  readonly covered?: unknown;
  readonly ratchetKey?: unknown;
  readonly declarationKey?: unknown;
  readonly anchor?: unknown;
  readonly line?: unknown;
  readonly endLine?: unknown;
};

type CrapOptions = {
  readonly tool: string;
  readonly limit?: number;
  readonly unknownMessage?: typeof MESSAGES.crapCoverageUnknown;
};

type Ratcheted = {
  readonly finding: Finding;
  readonly fn: CrapFunction;
  readonly crap: number;
  readonly limit: number;
  readonly route: string;
  readonly shown: string;
};

function crapText(
  fn: CrapFunction,
  crap: number | undefined,
  {
    shown,
    limit,
    unknownMessage,
  }: { readonly shown: string; readonly limit: number; readonly unknownMessage: string },
): ReturnType<typeof messageFields> {
  if (crap === undefined) {
    return messageFields(unknownMessage, { name: shown });
  }
  const template = fn.covered === true ? MESSAGES.crapScoreLimitCovered : MESSAGES.crapScoreLimit;
  return messageFields(template, { name: shown, crap: crap.toFixed(2), limit });
}

export function crapFindings(
  functions: readonly CrapFunction[],
  {
    tool,
    limit = DEFAULT_CRAP_SCORE_LIMIT,
    unknownMessage = MESSAGES.crapCoverageUnknown,
  }: CrapOptions,
): Finding[] {
  const findings: Finding[] = [];
  for (const fn of functions) {
    const crap = typeof fn.crap === 'number' && Number.isFinite(fn.crap) ? fn.crap : undefined;
    if (crap !== undefined && crap < limit) {
      continue;
    }
    const rule = crap === undefined ? RULE_IDS.crapCoverageUnknown : RULE_IDS.crapScoreLimit;
    const shown = normalizeFunctionName(textOf(fn.name));
    const route = textOf(
      exceptionRoute({
        rule,
        path: textOf(fn.path),
        function: shown,
        name: undefined,
        key: undefined,
      }),
    );
    const text = crapText(fn, crap, { shown, limit, unknownMessage });
    const finding = {
      tool,
      rule,
      path: textOf(fn.path),
      identity: textOf(fn.identity),
      message: `${textOf(text['message'])} ${route}`,
      ...allowedFormField(text['allowedForm']),
      classification: 'enforceable',
      symbol: textOf(fn.name),
      ...anchorOf(fn),
      ...locationOf(fn),
    };
    findings.push(
      crap === undefined || fn.ratchetKey === undefined
        ? finding
        : withRatchet({ finding, fn, crap, limit, route, shown }),
    );
  }
  return findings;
}

function anchorOf({ anchor }: CrapFunction): { anchor?: { key: unknown } } {
  return anchor === undefined ? {} : { anchor: { key: anchor } };
}

function locationOf({ line, endLine }: CrapFunction): ReturnType<typeof locationFrom> {
  return locationFrom(line, endLine, 'endLine');
}

function withRatchet({ finding, fn, crap: rawCrap, limit, route, shown }: Ratcheted): Finding {
  const crap = Number(rawCrap.toFixed(2));
  const worse = messageFields(GREW_MESSAGES.crap, { name: shown, crap, limit, base: '{base}' });
  return {
    ...finding,
    ratchet: {
      key: fn.ratchetKey,
      ...(fn.declarationKey === undefined ? {} : { declarationKey: fn.declarationKey }),
      value: crap,
      worseMessage: `${textOf(worse['message'])} ${route}`,
      ...definedField('worseAllowedForm', worse['allowedForm']),
      heldMessage: renderMessage(HELD_MESSAGES.crap, {
        name: shown,
        crap: rawCrap.toFixed(2),
        limit,
        base: '{base}',
      }),
    },
  };
}
