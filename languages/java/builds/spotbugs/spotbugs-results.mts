import path from 'node:path';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { PLACED, type Placed } from './spotbugs-placed.mts';

export type EngineSpotbugsFinding = {
  readonly file: string;
  readonly rule: string;
  readonly line: number;
  readonly message: string;
  readonly symbol: string | undefined;
  readonly priority?: number | undefined;
  readonly arguments?: readonly string[] | undefined;
};
type LogicalLocation = {
  readonly name: string;
  readonly kind: string;
  readonly fullyQualifiedName: string;
};
export type SpotbugsResult = {
  readonly ruleId: string;
  readonly message: {
    readonly id: string;
    readonly text: string;
    readonly arguments: readonly string[];
  };
  readonly level: string;
  readonly locations: readonly [
    {
      readonly physicalLocation: {
        readonly artifactLocation: { readonly uri: string };
        readonly region?: { readonly startLine: number };
      };
      readonly logicalLocations: readonly [LogicalLocation];
    },
  ];
};
type Shape = {
  readonly pattern: RegExp;
  readonly text: string;
  readonly place: (parts: readonly [string, string], symbol: string | undefined) => LogicalLocation;
};

const CONSTRUCTOR = 'new ';
const LEVEL = 'note';

export function classOf(method: string): string {
  const signature = method.slice(0, method.indexOf('('));
  return signature.startsWith(CONSTRUCTOR)
    ? signature.slice(CONSTRUCTOR.length)
    : signature.slice(0, signature.lastIndexOf('.'));
}

function packageOf(binary: string): string {
  const dot = binary.lastIndexOf('.');
  return dot === -1 ? '' : binary.slice(0, dot);
}

function member([method, field]: readonly [string, string]): LogicalLocation {
  return {
    name: field,
    kind: 'member',
    fullyQualifiedName: `${classOf(method)}.${field.slice(field.lastIndexOf('.') + 1)}`,
  };
}

function variable(
  [method]: readonly [string, string],
  symbol: string | undefined,
): LogicalLocation {
  const named = symbol ?? `${method}#?`;
  return {
    name: named.slice(named.lastIndexOf('#') + 1),
    kind: 'variable',
    fullyQualifiedName: named,
  };
}

function constructor([owner, method]: readonly [string, string]): LogicalLocation {
  const local = packageOf(owner);
  const shortened = local === '' ? method : method.replace(`${CONSTRUCTOR}${local}.`, CONSTRUCTOR);
  return { name: shortened, kind: 'function', fullyQualifiedName: method };
}

const SHAPES: Readonly<Record<string, Shape>> = {
  EI_EXPOSE_REP: {
    pattern: /^(.+) may expose internal representation by returning (\S+)$/u,
    text: 'May expose internal representation by returning reference to mutable object',
    place: member,
  },
  MS_EXPOSE_REP: {
    pattern: /^Public static (.+) may expose internal representation by returning (\S+)$/u,
    text: 'Public static method may expose internal representation by returning a mutable object or array',
    place: member,
  },
  EI_EXPOSE_REP2: {
    pattern:
      /^(.+) may expose internal representation by storing an externally mutable object into (\S+)$/u,
    text: 'May expose internal representation by incorporating reference to mutable object',
    place: variable,
  },
  EI_EXPOSE_STATIC_REP2: {
    pattern:
      /^(.+) may expose internal static state by storing a mutable object into a static field (\S+)$/u,
    text: 'May expose internal static state by storing a mutable object into a static field',
    place: variable,
  },
  CT_CONSTRUCTOR_THROW: {
    pattern: /^Exception thrown in class (\S+) at (.+?) will leave the constructor\./u,
    text: 'Be wary of letting constructors throw exceptions.',
    place: constructor,
  },
};

function withoutPackage(qualified: string, owner: string): string {
  const local = packageOf(owner);
  return local === '' ? qualified : qualified.slice(local.length + 1);
}

function ownerOf(kind: string, qualified: string): string {
  if (kind === 'type') {
    return qualified;
  }
  if (kind === 'member') {
    return qualified.slice(0, qualified.lastIndexOf('.'));
  }
  const method = kind === 'variable' ? qualified.slice(0, qualified.lastIndexOf('#')) : qualified;
  return classOf(method);
}

function placeName(kind: string, qualified: string, owner: string): string {
  if (kind === 'variable') {
    return qualified.slice(qualified.lastIndexOf('#') + 1);
  }
  if (kind !== 'function') {
    return withoutPackage(qualified, owner);
  }
  if (qualified.startsWith(CONSTRUCTOR)) {
    return `${CONSTRUCTOR}${withoutPackage(qualified.slice(CONSTRUCTOR.length), owner)}`;
  }
  const open = qualified.indexOf('(');
  return qualified.slice(qualified.lastIndexOf('.', open) + 1);
}

function placedNameOf(
  finding: EngineSpotbugsFinding,
  placed: Placed,
  [kind, qualified, owner]: readonly [string, string, string],
): string {
  if (placed.byArguments === true) {
    return finding.arguments?.[1] ?? qualified;
  }
  return placed.classNamed?.includes(finding.priority ?? 0)
    ? withoutPackage(qualified, owner)
    : placeName(kind, qualified, owner);
}

function placedResultOf(finding: EngineSpotbugsFinding, placed: Placed): SpotbugsResult {
  const place = finding.symbol ?? '';
  const colon = place.indexOf(':');
  const level = placed.levels[finding.priority ?? 0];
  if (colon < 1 || level === undefined) {
    throw new Error(`the engine wrote a ${finding.rule} finding nitpicker cannot place: ${place}`);
  }
  const kind = place.slice(0, colon);
  const qualified = place.slice(colon + 1);
  const owner = ownerOf(kind, qualified);
  const subject = placed.byArguments === true ? (finding.arguments?.[0] ?? owner) : owner;
  const directory = packageOf(subject).replaceAll('.', '/');
  const file = path.basename(finding.file);
  return {
    ruleId: finding.rule,
    message: { id: 'default', text: placed.text, arguments: finding.arguments ?? [qualified] },
    level,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: directory === '' ? file : `${directory}/${file}` },
          ...(finding.line === 0 ? {} : { region: { startLine: finding.line } }),
        },
        logicalLocations: [
          {
            name: placedNameOf(finding, placed, [kind, qualified, owner]),
            kind,
            fullyQualifiedName: qualified,
          },
        ],
      },
    ],
  };
}

function classOfFinding(rule: string, [first]: readonly [string, string]): string {
  return rule === 'CT_CONSTRUCTOR_THROW' ? first : classOf(first);
}

export function spotbugsResultOf(finding: EngineSpotbugsFinding): SpotbugsResult {
  const placed = PLACED[finding.rule];
  if (placed !== undefined) {
    return placedResultOf(finding, placed);
  }
  const shape = SHAPES[finding.rule];
  const matched = shape?.pattern.exec(finding.message);
  const [, first, second] = matched ?? [];
  if (shape === undefined || first === undefined || second === undefined) {
    throw new Error(
      `the engine wrote a ${finding.rule} finding nitpicker cannot read: ${finding.message}`,
    );
  }
  const parts: readonly [string, string] = [first, second];
  const directory = packageOf(classOfFinding(finding.rule, parts)).replaceAll('.', '/');
  const file = path.basename(finding.file);
  return {
    ruleId: finding.rule,
    message: { id: 'default', text: shape.text, arguments: parts },
    level: LEVEL,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: directory === '' ? file : `${directory}/${file}` },
          region: { startLine: finding.line },
        },
        logicalLocations: [shape.place(parts, finding.symbol)],
      },
    ],
  };
}

export function engineSpotbugsFindingOf(value: unknown): EngineSpotbugsFinding {
  const symbol = fieldOf(value, 'symbol');
  const priority = fieldOf(value, 'priority');
  const listed = fieldOf(value, 'arguments');
  return {
    file: String(fieldOf(value, 'file')),
    rule: String(fieldOf(value, 'rule')),
    line: Number(fieldOf(value, 'line')),
    message: String(fieldOf(value, 'message')),
    symbol: typeof symbol === 'string' ? symbol : undefined,
    priority: typeof priority === 'number' ? priority : undefined,
    ...(Array.isArray(listed) ? { arguments: textsOf(listed) } : {}),
  };
}
