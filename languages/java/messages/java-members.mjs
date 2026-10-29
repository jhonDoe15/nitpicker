const STRUCTURE = /[{}();,[\]]/gu;
const TYPE_HEADER = /(?:^|[^\w$.])(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/u;
const ANNOTATIONS = /@(?!interface\b)[\w$.]+(?:\s*\([^()]*\))?/gu;
const ASSIGNMENT = /(?<![=!<>+\-*/%&|^])=(?!=)/u;
const NAME_BEFORE = /([A-Za-z_$][\w$]*)\s*(?:\[\s*\]\s*)*$/u;
const FIRST_NAME = /^\s*([A-Za-z_$][\w$]*)/u;
const CALL_NAME = /([A-Za-z_$][\w$]*)\s*(?:<[^<>]*>\s*)?$/u;
const ANONYMOUS_TAIL = /\bnew\s+[\w$.]+(?:\s*<[^()]*>)?\s*$/u;
const DEPTH = { '(': 1, '[': 1, ')': -1, ']': -1 };
const BACKWARD_DEPTH = { ')': 1, '(': -1 };

function typeFrame(name, { kind, parent, owner }) {
  return {
    frame: 'type',
    name,
    kind,
    parent,
    owner,
    depth: 0,
    memberStart: 0,
    members: [],
    constants: kind === 'enum',
  };
}

function headerOf(state, type, index) {
  return state.text.slice(type.memberStart, index).replaceAll(ANNOTATIONS, ' ').trim();
}

function topLevelAssignment(header) {
  let depth = 0;
  let flat = '';
  for (const character of header) {
    depth += DEPTH[character] ?? 0;
    flat += depth === 0 ? character : ' ';
  }
  return ASSIGNMENT.exec(flat)?.index;
}

function isAnonymousBrace(text, index) {
  const before = text.slice(0, index).trimEnd();
  if (!before.endsWith(')')) {
    return false;
  }
  let depth = 0;
  let open = before.length - 1;
  for (const character of [...before].reverse()) {
    depth += BACKWARD_DEPTH[character] ?? 0;
    if (depth === 0) {
      return ANONYMOUS_TAIL.test(before.slice(0, open));
    }
    open -= 1;
  }
  return false;
}

function addMember(type, member) {
  type.members.push(member);
  return member;
}

function memberFromHeader(type, header, { start, brace }) {
  const assignment = topLevelAssignment(header);
  const isStatic = /\bstatic\b/u.test(header) || type.kind === 'interface';
  if (assignment !== undefined) {
    return {
      kind: 'field',
      name: NAME_BEFORE.exec(header.slice(0, assignment))?.[1],
      isStatic,
      start,
    };
  }
  if (brace && (header === 'static' || header === '')) {
    return {
      kind: header === 'static' ? 'static-block' : 'initializer',
      isStatic: header === 'static',
      start,
    };
  }
  const parameters = header.indexOf('(');
  const name = CALL_NAME.exec(parameters < 0 ? header : header.slice(0, parameters))?.[1];
  if (name === type.name && brace) {
    return { kind: 'constructor', name, isStatic: false, start };
  }
  return { kind: parameters < 0 ? 'field' : 'method', name, isStatic, start };
}

function openInType(state, type, index) {
  const header = headerOf(state, type, index);
  if (type.depth > 0 || topLevelAssignment(header) !== undefined) {
    const owner =
      type.current ??
      addMember(type, memberFromHeader(type, header, { start: type.memberStart, brace: false }));
    type.current = owner;
    return isAnonymousBrace(state.text, index)
      ? typeFrame('', { kind: 'anonymous', parent: type, owner })
      : { frame: 'block' };
  }
  if (type.constants) {
    type.current ??= addMember(type, {
      kind: 'constant',
      name: FIRST_NAME.exec(header)?.[1],
      isStatic: true,
      start: type.memberStart,
    });
    return typeFrame('', { kind: 'anonymous', parent: type, owner: type.current });
  }
  const declared = TYPE_HEADER.exec(header);
  if (declared !== null && (!header.includes('(') || declared.index < header.indexOf('('))) {
    const kind = declared[1];
    const member = addMember(type, {
      kind: 'type',
      name: declared[2],
      isStatic: true,
      start: type.memberStart,
    });
    return typeFrame(declared[2], { kind, parent: type, owner: member });
  }
  const body = memberFromHeader(type, header, { start: type.memberStart, brace: true });
  return { frame: 'block', body: addMember(type, body) };
}

function openInBlock(state, index) {
  const before = state.text.slice(0, index);
  const declared = TYPE_HEADER.exec(
    before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('{')) + 1),
  );
  if (declared !== null) {
    return typeFrame(declared[2], { kind: declared[1], parent: undefined, owner: undefined });
  }
  return isAnonymousBrace(state.text, index)
    ? typeFrame('', { kind: 'anonymous' })
    : { frame: 'block' };
}

function open(state, index) {
  const top = state.stack.at(-1);
  if (top === undefined) {
    const declared = TYPE_HEADER.exec(state.text.slice(state.unitStart, index));
    state.stack.push(typeFrame(declared?.[2] ?? '', { kind: declared?.[1] ?? 'class' }));
  } else {
    state.stack.push(
      top.frame === 'type' ? openInType(state, top, index) : openInBlock(state, index),
    );
  }
  const pushed = state.stack.at(-1);
  pushed.start = index;
  if (pushed.frame === 'type') {
    pushed.memberStart = index + 1;
    state.types.push(pushed);
  }
}

function endMember(type, end) {
  if (type.current !== undefined) {
    type.current.end = end;
  }
  type.current = undefined;
  type.memberStart = end + 1;
}

function close(state, index) {
  const closed = state.stack.pop();
  if (closed === undefined) {
    return;
  }
  closed.end = index;
  const parent = state.stack.at(-1);
  if (closed.frame === 'type' && parent === undefined) {
    state.unitStart = index + 1;
  }
  if (parent?.frame !== 'type' || parent.depth > 0 || parent.current !== undefined) {
    return;
  }
  const member = closed.body ?? (closed.frame === 'type' ? closed.owner : undefined);
  if (member !== undefined) {
    member.end = index;
    parent.memberStart = index + 1;
  }
}

function punctuate(state, { character, index }) {
  const type = state.stack.at(-1);
  if (type?.frame !== 'type') {
    return;
  }
  type.depth += DEPTH[character] ?? 0;
  if (type.depth > 0 || character === '(' || character === ')') {
    return;
  }
  if (character === ';' || (character === ',' && type.constants)) {
    if (
      character === ',' ||
      type.current?.kind === 'constant' ||
      headerOf(state, type, index) !== ''
    ) {
      type.current ??= addMember(type, constantOrField(state, type, index));
    }
    endMember(type, index);
    type.constants = type.constants && character === ',';
  }
}

function constantOrField(state, type, index) {
  const header = headerOf(state, type, index);
  if (type.constants) {
    return {
      kind: 'constant',
      name: FIRST_NAME.exec(header)?.[1],
      isStatic: true,
      start: type.memberStart,
    };
  }
  return memberFromHeader(type, header, { start: type.memberStart, brace: false });
}

export function javaOutline(text) {
  const state = { text, stack: [], types: [], unitStart: 0 };
  for (const match of text.matchAll(STRUCTURE)) {
    const [character] = match;
    if (character === '{') {
      open(state, match.index);
    } else if (character === '}') {
      close(state, match.index);
    } else {
      punctuate(state, { character, index: match.index });
    }
  }
  return state.types;
}

function contains(range, offset) {
  return range.start <= offset && offset <= (range.end ?? Number.POSITIVE_INFINITY);
}

const MAX_NESTING = 8;

function namedPlace(type, member) {
  return Array.from({ length: MAX_NESTING }).reduce(
    (place) =>
      place.type.kind === 'anonymous' && place.type.parent !== undefined
        ? { type: place.type.parent, member: place.type.owner }
        : place,
    { type, member },
  );
}

export function placeAt(types, offset) {
  const type = types.filter((candidate) => contains(candidate, offset)).at(-1);
  if (type === undefined) {
    return undefined;
  }
  const member = type.members.find((candidate) => contains(candidate, offset));
  return namedPlace(type, member);
}
