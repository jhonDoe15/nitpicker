import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import type { ReplaceEdit } from '../../typed/project-types.mts';
import { alignRegions } from '../lockstep.mts';
import {
  holeArgumentText,
  holeParameterText,
  identifierTexts,
  nameHoles,
  nameTypeHoles,
  replacedText,
  symbolTypeString,
  topLevelStatement,
  typeArgumentText,
} from '../render.mts';
import { templateProblem } from '../scope.mts';
import { descendants, isTypeScriptFile, normalizedText } from '../syntax.mts';
import {
  bodyOf,
  eachSide,
  paired,
  type Aligned,
  type Both,
  type ExtractEnv,
  type Extracted,
  type Hole,
  type NamedHole,
  type Region,
  type UnitNode,
  type WholeInput,
} from '../typed/extract-types.mts';
import {
  dedentedToLeast,
  helperNameFor,
  withLineEndingOf,
  withWidened,
} from '../typed/typed-views.mts';
import { isAsync, lostComments, unitProblem } from './unit-check.mts';
import { writesOf } from '../writes.mts';

const ts = typescriptApi();

function regionOf(unit: UnitNode): Region {
  return { pos: bodyOf(unit).pos, end: bodyOf(unit).end };
}

function alignment(units: Both<UnitNode>, env: ExtractEnv): Aligned {
  const [first, second] = units;
  const typePairs: Both<TypeScript.Node>[] =
    first.type === undefined || second.type === undefined ? [] : [[first.type, second.type]];
  const pairs: Both<TypeScript.Node>[] = [
    ...paired(first.parameters, second.parameters),
    ...typePairs,
    [bodyOf(first), bodyOf(second)],
  ];
  const regions = eachSide(units, regionOf);
  const writes = eachSide(units, (unit) => writesOf(unit, env.checker));
  return alignRegions(pairs, {
    ...env,
    typeHoles: true,
    units,
    regions,
    written: eachSide(writes, (list) => new Set(list.map(({ symbol }) => symbol))),
    regionWrites: eachSide(
      writes,
      (list, side) =>
        new Set(
          list
            .filter(({ node }) => node.pos >= regions[side].pos && node.end <= regions[side].end)
            .map(({ symbol }) => symbol),
        ),
    ),
  });
}

function parameterTypeTexts(
  units: Both<UnitNode>,
  env: ExtractEnv,
  typeHoles: readonly NamedHole[],
): (string | undefined)[] {
  return paired(units[0].parameters, units[1].parameters).map(([parameter, other]) => {
    if (parameter.type !== undefined && other.type !== undefined) {
      return typeText(parameter.type, typeHoles, env.sourceFile);
    }
    const texts = [parameter, other].map((own) =>
      own.type === undefined
        ? symbolTypeString(env.checker, env.checker.getSymbolAtLocation(own.name))
        : normalizedText(own.type, env.sourceFile),
    );
    return texts[0] === texts[1] ? (parameter.type?.getText() ?? texts[0]) : undefined;
  });
}

function typeText(
  node: TypeScript.Node,
  typeHoles: readonly NamedHole[],
  sourceFile: TypeScript.SourceFile,
): string {
  const range = { start: node.getStart(sourceFile), end: node.end };
  return replacedText(range, typeHoles, sourceFile);
}

function typeParameterList(typeHoles: readonly NamedHole[]): string {
  return typeHoles.length === 0 ? '' : `<${typeHoles.map((hole) => hole.name).join(', ')}>`;
}

function hasValueReturn(unit: UnitNode): boolean {
  return (
    !ts.isBlock(bodyOf(unit)) ||
    descendants(bodyOf(unit)).some(
      (node) => ts.isReturnStatement(node) && node.expression !== undefined,
    )
  );
}

function identifierText(name: TypeScript.BindingName): string {
  return ts.isIdentifier(name) ? name.text : name.getText();
}

type Plan = {
  readonly units: Both<UnitNode>;
  readonly name: string;
  readonly holes: readonly NamedHole[];
  readonly typeHoles: readonly NamedHole[];
  readonly precise: boolean;
};

function helperDeclaration(plan: Plan, env: ExtractEnv): string {
  const { units, name, holes, typeHoles, precise } = plan;
  const typed = isTypeScriptFile(env.path);
  const types = typed ? parameterTypeTexts(units, env, typeHoles) : [];
  const own = units[0].parameters.map(
    (parameter, index) =>
      `${identifierText(parameter.name)}${types[index] === undefined ? '' : `: ${types[index]}`}`,
  );
  const extra = holes.map((hole) => holeParameterText(hole, env.checker, { typed, precise }));
  const body = bodyOf(units[0]);
  const range = { start: body.getStart(env.sourceFile), end: body.end };
  const text = replacedText(range, [...holes, ...typeHoles], env.sourceFile);
  const block = ts.isBlock(body) ? dedentedToLeast(text) : `{\n  return ${text};\n}`;
  const returns =
    typed && units[0].type !== undefined
      ? `: ${typeText(units[0].type, typeHoles, env.sourceFile)}`
      : '';
  const head = `${name}${typeParameterList(typeHoles)}(${[...own, ...extra].join(', ')})`;
  return `${isAsync(units[0]) ? 'async ' : ''}function ${head}${returns} ${block}`;
}

function callText({ units, name, holes, typeHoles }: Plan, side: 0 | 1, env: ExtractEnv): string {
  const own = units[side].parameters.map((parameter) => parameter.name.getText(env.sourceFile));
  const extra = holes.map((hole) => holeArgumentText(hole, side, env.sourceFile));
  const typeArguments = typeHoles.map((hole) => typeArgumentText(hole, side, env.sourceFile));
  const generic = typeArguments.length === 0 ? '' : `<${typeArguments.join(', ')}>`;
  return `${name}${generic}(${[...own, ...extra].join(', ')})`;
}

function bodyReplacement(
  unit: UnitNode,
  call: string,
  env: ExtractEnv,
): Omit<ReplaceEdit, 'type' | 'path'> {
  const body = bodyOf(unit);
  const start = body.getStart(env.sourceFile);
  if (!ts.isBlock(body)) {
    return { start, end: body.end, text: call };
  }
  const lineStart = env.sourceFile.text.lastIndexOf('\n', start - 1) + 1;
  const indent = /^[ \t]*/u.exec(env.sourceFile.text.slice(lineStart, start))?.[0] ?? '';
  const returns = hasValueReturn(unit) || isAsync(unit);
  return {
    start,
    end: body.end,
    text: `{\n${indent}  ${returns ? 'return ' : ''}${call};\n${indent}}`,
  };
}

function editsFor(plan: Plan, env: ExtractEnv): ReplaceEdit[] {
  const insertAt = topLevelStatement(plan.units[0]).end;
  const calls = eachSide(plan.units, (unit, side) =>
    bodyReplacement(unit, callText(plan, side, env), env),
  );
  const helper = { start: insertAt, end: insertAt, text: `\n\n${helperDeclaration(plan, env)}` };
  return [...calls, helper].map((edit) => ({
    type: 'replace',
    path: env.path,
    ...edit,
    text: withLineEndingOf(env.sourceFile.text, edit.text),
  }));
}

function unitProblems(units: Both<UnitNode>, env: ExtractEnv): string | undefined {
  return (
    unitProblem(units) ??
    (lostComments(units, env.sourceFile)
      ? 'the second copy has comments the shared function would drop'
      : undefined)
  );
}

function holeCountProblem(
  aligned: { readonly holes: readonly Hole[]; readonly typeSites: number },
  engineHoles: number,
): string | undefined {
  const values = aligned.holes.filter(({ kind }) => kind !== 'type').length;
  return values + aligned.typeSites === engineHoles
    ? undefined
    : 'the differing values do not match the ones the rule found';
}

function analysis({ units, engineHoles }: WholeInput, env: ExtractEnv): Aligned {
  const problem = unitProblems(units, env);
  if (problem !== undefined) {
    return { declined: problem };
  }
  const aligned = alignment(units, env);
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const found = holeCountProblem(aligned, engineHoles);
  if (found !== undefined) {
    return { declined: found };
  }
  const holeNodes = aligned.holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
  const template = templateProblem([bodyOf(units[0])], { ...env, unit: units[0], holeNodes });
  return template === undefined ? aligned : { declined: template };
}

export function wholeExtraction(input: WholeInput, env: ExtractEnv): Extracted {
  const aligned = analysis(input, env);
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const taken = new Set([...identifierTexts(env.sourceFile), ...env.claimed]);
  const name = helperNameFor(input.label, taken);
  const values = aligned.holes.filter(({ kind }) => kind !== 'type');
  const holes = name === undefined ? undefined : nameHoles(values, new Set([...taken, name]));
  const typeHoles = nameTypeHoles(
    aligned.holes.filter(({ kind }) => kind === 'type'),
    taken,
  );
  if (name === undefined || holes === undefined || typeHoles === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  env.claim(name);
  const plan = { units: input.units, name, holes, typeHoles };
  return withWidened(
    editsFor({ ...plan, precise: true }, env),
    editsFor({ ...plan, precise: false }, env),
  );
}
