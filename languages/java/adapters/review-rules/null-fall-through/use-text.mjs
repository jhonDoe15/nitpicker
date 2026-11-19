const MAX_SHOWN = 40;
const CALL_OPEN = 3;
const CALL_CLOSE = 4;

function shortened(text) {
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}...` : text;
}

function memberText(source, index) {
  const { tokens, partner } = source;
  const member = `${tokens[index].text}.${tokens[index + 2].text}`;
  const call = tokens[index + CALL_OPEN]?.text === '(';
  const empty = call && partner[index + CALL_OPEN] === index + CALL_CLOSE;
  return shortened(call ? `${member}(${empty ? '' : '...'})` : member);
}

function argumentText(source, index) {
  const { tokens, opener } = source;
  const name = tokens[index].text;
  const open = opener[index];
  const callee = tokens[open - 1];
  if (open < 0 || tokens[open].text !== '(' || callee === undefined) {
    return name;
  }
  if (callee.text === 'for') {
    return `for (... : ${name})`;
  }
  return shortened(callee.kind === 'identifier' ? `${callee.text}(...)` : name);
}

export function useText(source, index) {
  const { tokens } = source;
  const name = tokens[index].text;
  const after = tokens[index + 1]?.text;
  if (after === '[') {
    return `${name}[...]`;
  }
  if (after === '.' && tokens[index + 2] !== undefined) {
    return memberText(source, index);
  }
  return after === '!!' ? `${name}!!` : argumentText(source, index);
}
