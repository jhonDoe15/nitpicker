import path from 'node:path';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import {
  CONSTRUCTOR,
  classOf,
  fieldName,
  ownerOf,
  packageOf,
  placeName,
  relativeName,
  withoutPackage,
} from './names/spotbugs-names.mts';
import { PLACED, placesByArguments, placesByName, type Placed } from './spotbugs-placed.mts';

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

const LEVEL = 'note';

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

function shownName(placed: Placed, place: string, qualified: string): string | undefined {
  const at = place.lastIndexOf('@');
  if (!placesByName(placed) || at === -1) {
    return undefined;
  }
  const shown = place.slice(at + 1);
  return placed.placement === 'relative' ? relativeName(qualified, shown) : shown;
}

function placedNameOf(finding: EngineSpotbugsFinding, placed: Placed, parts: PlaceParts): string {
  const { kind, qualified, place, priority, owner } = parts;
  if (placesByArguments(placed)) {
    return finding.arguments?.[1] ?? qualified;
  }
  return (
    shownName(placed, place, qualified) ??
    (placed.classNamed?.includes(priority)
      ? withoutPackage(qualified, owner)
      : placeName(kind, qualified, owner))
  );
}

function readerOf(
  finding: EngineSpotbugsFinding,
  placed: Placed,
  kind: string,
): string | undefined {
  const method = finding.arguments?.[1];
  return placed.fieldsUnderMethod === true && kind === 'member' && method !== undefined
    ? classOf(method)
    : undefined;
}

type PlaceParts = {
  readonly kind: string;
  readonly qualified: string;
  readonly written: string | undefined;
  readonly level: string;
  readonly place: string;
  readonly priority: number;
  readonly owner: string;
};

function placePartsOf(finding: EngineSpotbugsFinding, placed: Placed): PlaceParts {
  const place = finding.symbol ?? '';
  const colon = place.indexOf(':');
  const priority = finding.priority ?? 0;
  const level = placed.levels[priority];
  if (colon < 1 || level === undefined) {
    throw new Error(`the engine wrote a ${finding.rule} finding nitpicker cannot place: ${place}`);
  }
  const body = place.slice(colon + 1);
  const at = placesByName(placed) ? body.lastIndexOf('@') : -1;
  const [qualified = '', written] = (at === -1 ? body : body.slice(0, at)).split('|');
  const kind = place.slice(0, colon);
  return { kind, qualified, written, level, place, priority, owner: ownerOf(kind, qualified) };
}

function subjectOf(finding: EngineSpotbugsFinding, placed: Placed, owner: string): string {
  return placesByArguments(placed) ? (finding.arguments?.[0] ?? owner) : owner;
}

function placedLogicalOf(
  finding: EngineSpotbugsFinding,
  placed: Placed,
  parts: PlaceParts,
): LogicalLocation {
  const { kind, qualified, owner } = parts;
  const reader = readerOf(finding, placed, kind);
  if (reader === undefined) {
    return { name: placedNameOf(finding, placed, parts), kind, fullyQualifiedName: qualified };
  }
  const field = qualified.slice(qualified.lastIndexOf('.') + 1);
  return {
    name: fieldName(qualified, owner, reader),
    kind,
    fullyQualifiedName: `${reader}.${field}`,
  };
}

function placedResultOf(finding: EngineSpotbugsFinding, placed: Placed): SpotbugsResult {
  const parts = placePartsOf(finding, placed);
  const reader = readerOf(finding, placed, parts.kind);
  const subject = reader ?? subjectOf(finding, placed, parts.owner);
  const directory = (parts.written ?? packageOf(subject)).replaceAll('.', '/');
  const file = path.basename(finding.file);
  return {
    ruleId: finding.rule,
    message: {
      id: 'default',
      text: placed.text,
      arguments: finding.arguments ?? [parts.qualified],
    },
    level: parts.level,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: directory === '' ? file : `${directory}/${file}` },
          ...(finding.line === 0 ? {} : { region: { startLine: finding.line } }),
        },
        logicalLocations: [placedLogicalOf(finding, placed, parts)],
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
