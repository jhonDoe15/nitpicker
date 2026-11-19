import type { ClassInfo, FunctionInfo, TestScanned } from '../typed/discovery-types.mts';
import type { ConditionIndex } from '../typed/rule-types.mts';
import { groupOf } from '../typed/indexing.mts';
import { classesOf } from '../discovery/declarations.mts';
import { functionOwners, functionsOf } from '../discovery/functions.mts';

export type Constant = 'true' | 'false';

const FALSE: Constant = 'false';

type CondEntry = {
  fn: FunctionInfo;
  owner: ClassInfo;
  value: boolean;
  companion: ClassInfo | undefined;
};

export const DISABLING_BASE = Object.freeze(['Disabled', 'Ignore', 'Ignored']);
const CONSTANT_BODY = /^(?:return\s+)?(true|false)$/u;
const CONSTANT_TEXT = /^(?:#\{\s*)?(true|false)(?:\s*\})?$/u;
const CONST_VAL = /(?:^|\s)val\s+([A-Za-z_]\w*)(?:\s*:\s*Boolean)?\s*=\s*(true|false)\b/gmu;
const STRING_ARGUMENT = /"([^"]*)"/u;
const CLASS_ARGUMENT = /([\w.]+)::class/u;
const ENABLED_ASSIGNMENT = /\benabled\s*=\s*([^,)\n]+)/u;
const ENABLED_IF = /\benabledIf\s*=\s*\{([^}]*)\}/u;
const REASON_IF = /\benabledOrReasonIf\s*=\s*\{([^}]*)/u;
const LAMBDA_PARAMS = /^[\w, ]*->/u;
const DISABLED_REASON = /^Enabled\s*\.\s*disabled\s*\(/u;
const NO_INVOCATIONS = /\binvocations\s*=\s*0\b/u;
const POSITIONAL_FALSE = /^\s*false\s*(?:,|$)/u;

function asConstant(value: boolean): Constant {
  return value ? 'true' : FALSE;
}

export function constantBoolean(
  text: string,
  constants: Map<string, boolean> = new Map(),
): Constant | undefined {
  const trimmed = text.trim();
  const negations = trimmed.match(/^!+/u)?.[0].length ?? 0;
  const rest = trimmed.slice(negations).trim();
  const known = rest === 'true' || rest === FALSE ? rest === 'true' : constants.get(rest);
  return known === undefined ? undefined : asConstant(known !== (negations % 2 === 1));
}

export function constantValues(scanned: TestScanned): Map<string, boolean> {
  const values = new Map<string, boolean>();
  const conflicting = new Set<string>();
  for (const match of scanned.code.matchAll(CONST_VAL)) {
    const name = groupOf(match, 1);
    if (values.has(name) && values.get(name) !== (match[2] === 'true')) {
      conflicting.add(name);
    }
    values.set(name, match[2] === 'true');
  }
  return new Map([...values].filter(([name]) => !conflicting.has(name)));
}

function lambdaBody(text: string): string {
  const trimmed = text.trim();
  return trimmed.slice(LAMBDA_PARAMS.exec(trimmed)?.[0].length ?? 0).trim();
}

export function disablesByConfig(config: string, constants: Map<string, boolean>): boolean {
  const assigned = ENABLED_ASSIGNMENT.exec(config)?.[1];
  const enabledIf = ENABLED_IF.exec(config)?.[1];
  const lambda = enabledIf === undefined ? undefined : lambdaBody(enabledIf);
  const reason = REASON_IF.exec(config)?.[1];
  return (
    POSITIONAL_FALSE.test(config) ||
    NO_INVOCATIONS.test(config) ||
    (reason !== undefined && DISABLED_REASON.test(lambdaBody(reason))) ||
    (assigned !== undefined && constantBoolean(assigned, constants) === FALSE) ||
    (lambda !== undefined && constantBoolean(lambda, constants) === FALSE)
  );
}

function bodyConstant(text: string): Constant | undefined {
  const value = CONSTANT_BODY.exec(text.trim())?.[1];
  return value === undefined ? undefined : asConstant(value === 'true');
}

function companionOwner(klass: ClassInfo, classes: ClassInfo[]): ClassInfo | undefined {
  return klass.modifiers.has('companion')
    ? classes
        .filter((outer) => outer.bodyOpen < klass.offset && klass.offset < outer.bodyClose)
        .at(-1)
    : undefined;
}

function conditionEntries(scanned: TestScanned): CondEntry[] {
  const classes = classesOf(scanned);
  const owners = functionOwners(scanned);
  return functionsOf(scanned).flatMap((fn) => {
    const value = bodyConstant(scanned.code.slice(fn.body.start, fn.body.end));
    const owner = owners.get(fn.offset);
    return value === undefined || owner === undefined
      ? []
      : [{ fn, owner, value: value === 'true', companion: companionOwner(owner, classes) }];
  });
}

export function conditionIndex(scanned: TestScanned): ConditionIndex {
  const entries = conditionEntries(scanned);
  const methods = new Map(
    entries.flatMap(({ fn, owner, value, companion }) =>
      [owner, companion]
        .filter((klass) => klass !== undefined)
        .map((klass): [string, boolean] => [`${String(klass.offset)}:${fn.name}`, value]),
    ),
  );
  const enabled = new Map(
    entries
      .filter(({ fn }) => fn.name === 'enabled')
      .map(({ owner, value }): [string, boolean] => [owner.name, value]),
  );
  return { methods, enabled };
}

export function conditionValue(
  args: string,
  context: { index: ConditionIndex; chain: ClassInfo[] },
): Constant | undefined {
  const { index, chain } = context;
  const text = STRING_ARGUMENT.exec(args)?.[1];
  if (text !== undefined) {
    const literal = CONSTANT_TEXT.exec(text.trim());
    const named = chain.map((klass) => index.methods.get(`${String(klass.offset)}:${text}`));
    const found = named.find((value) => value !== undefined);
    if (literal === null) {
      return found === undefined ? undefined : asConstant(found);
    }
    return asConstant(literal[1] === 'true');
  }
  const klass = CLASS_ARGUMENT.exec(args)?.[1];
  const enabled =
    klass === undefined ? undefined : index.enabled.get(klass.split('.').at(-1) ?? '');
  return enabled === undefined ? undefined : asConstant(enabled);
}
