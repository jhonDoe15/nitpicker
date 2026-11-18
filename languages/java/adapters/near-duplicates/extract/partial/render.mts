import type { Edit } from '../../extract-types.mts';
import type { PartialPlan } from './partial-types.mts';
import { dedentedToLeast, indentOf, indentedBy } from '../../jvm-views.mts';
import { present, required } from '../syntax.mts';
import { replacedText, throwsText } from '../render.mts';

const STEP = '    ';

function returnType(plan: PartialPlan): string {
  const output = present(plan.outputs[0]);
  if (output.kind === 'value') {
    return output.type;
  }
  return output.kind === 'return' ? required(plan.methods[0], 'type').text : 'void';
}

function runText(plan: PartialPlan): string {
  const statements = present(plan.statements[0]);
  const first = present(statements[0]);
  const last = present(statements.at(-1));
  const text = plan.text.slice(first.startIndex, last.endIndex);
  return replacedText({ startIndex: first.startIndex, text }, plan.holes);
}

function helperText(plan: PartialPlan): string {
  const output = present(plan.outputs[0]);
  const method = plan.methods[0];
  const base = indentOf(plan.text, method.startIndex);
  const parameters = [
    ...plan.inputs.map(({ names, type }) => `${type} ${names[0]}`),
    ...plan.holes.map((hole) => `${hole.type} ${hole.name}`),
  ];
  const tail = output.kind === 'value' ? `\nreturn ${output.name};` : '';
  const body = indentedBy(`${dedentedToLeast(runText(plan))}${tail}`, `${base}${STEP}`);
  const head = `private ${plan.isStatic ? 'static ' : ''}${returnType(plan)} ${plan.name}`;
  return `${head}(${parameters.join(', ')})${throwsText(method)} {\n${body}\n${base}}`;
}

function callText(plan: PartialPlan, side: number): string {
  const own = plan.inputs.map(({ names }) => names[side]);
  const extra = plan.holes.map((hole) => present(hole.occurrences[0])[side === 0 ? 'a' : 'b'].text);
  const call = `${plan.name}(${[...own, ...extra].join(', ')})`;
  const output = present(plan.outputs[side]);
  if (output.kind === 'value') {
    return `${output.prefix}${output.type} ${output.name} = ${call};`;
  }
  return output.kind === 'return' ? `return ${call};` : `${call};`;
}

export function partialEdits(plan: PartialPlan): Edit[] {
  const replacements = plan.statements.map((statements, side) => ({
    start: present(statements[0]).startIndex,
    end: present(statements.at(-1)).endIndex,
    text: callText(plan, side),
  }));
  const method = plan.methods[0];
  const at = method.endIndex;
  const insertion = {
    start: at,
    end: at,
    text: `\n\n${indentOf(plan.text, method.startIndex)}${helperText(plan)}`,
  };
  return [...replacements, insertion];
}
