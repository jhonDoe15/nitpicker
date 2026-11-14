import {
  indentOf,
  dedentedToLeast,
  indentedBy,
} from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { field } from '../syntax.mjs';
import { replacedText, throwsText } from '../render.mjs';

const STEP = '    ';

function returnType(plan) {
  const [output] = plan.outputs;
  if (output.kind === 'value') {
    return output.type;
  }
  return output.kind === 'return' ? field(plan.methods[0], 'type').text : 'void';
}

function runText(plan) {
  const [statements] = plan.statements;
  const first = statements[0];
  const last = statements.at(-1);
  const text = plan.text.slice(first.startIndex, last.endIndex);
  return replacedText({ startIndex: first.startIndex, text }, plan.holes);
}

function helperText(plan) {
  const [output] = plan.outputs;
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

function callText(plan, side) {
  const own = plan.inputs.map(({ names }) => names[side]);
  const extra = plan.holes.map((hole) => hole.occurrences[0][side === 0 ? 'a' : 'b'].text);
  const call = `${plan.name}(${[...own, ...extra].join(', ')})`;
  const output = plan.outputs[side];
  if (output.kind === 'value') {
    return `${output.prefix}${output.type} ${output.name} = ${call};`;
  }
  return output.kind === 'return' ? `return ${call};` : `${call};`;
}

export function partialEdits(plan) {
  const replacements = plan.statements.map((statements, side) => ({
    start: statements[0].startIndex,
    end: statements.at(-1).endIndex,
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
