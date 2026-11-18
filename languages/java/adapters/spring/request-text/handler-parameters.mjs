import { closingIndex, splitArguments } from '../../kotlin/scan/kotlin-brackets.mjs';

const MAPPING = /@\s*(?:\w+\s*\.\s*)*(?:Get|Post|Put|Delete|Patch|Request)Mapping\b/gu;
const ANNOTATION = /@\s*([\w.]+)(\s*\()?/uy;
const ANNOTATION_TEXT = /@\s*([\w.]+)(?:\s*\((?:[^()]|\([^()]*\))*\))?/gu;
const SKIPPED_ANNOTATIONS = new Set([
  'PathVariable',
  'RequestHeader',
  'CookieValue',
  'SessionAttribute',
  'RequestAttribute',
  'RequestPart',
  'MatrixVariable',
  'AuthenticationPrincipal',
  'CurrentSecurityContext',
]);
const FRAMEWORK_TYPE = new RegExp(
  [
    '^(?:Model|ModelMap|Map|BindingResult|Errors|Principal|Authentication|Pageable|Sort|Locale',
    'Session|WebRequest|RedirectAttributes|SessionStatus|UserDetails|MultipartFile',
    'Http\\w+|Servlet\\w+|Reactive\\w+|Server\\w+|\\w*Principal|\\w*Request|\\w*Response)$',
  ].join('|'),
  'u',
);
const FUNCTION_NAME = /\b(?:fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)|(\w+))\s*$/u;
const KOTLIN_PARAMETER = /^(?:(?:val|var|vararg) )?(\w+)\s*:\s*([\w.]+)(\?)?/u;
const JAVA_PARAMETER = /^(?:final )?([\w.]+)(?:<.*>)?(?:\[\])? (\w+)$/u;
const EXPRESSION_END = /\n\s*(?:@|fun\b|(?:private|public|internal|override)\b|\})/u;
const WHITESPACE = /\s+/gu;
const NOT_A_FORM_TYPE = /^(?:[a-z]|[A-Z]+$)/u;

function afterAnnotations(code, start) {
  const pending = [start];
  for (const position of pending) {
    const index = code.length - code.slice(position).trimStart().length;
    ANNOTATION.lastIndex = index;
    const match = ANNOTATION.exec(code);
    if (match === null) {
      return index;
    }
    pending.push(
      match[2] === undefined
        ? ANNOTATION.lastIndex
        : closingIndex(code, ANNOTATION.lastIndex - 1) + 1,
    );
  }
  return start;
}

function parseParameter(text, kotlin) {
  const annotations = [];
  const bare = text.replaceAll(ANNOTATION_TEXT, (_, name) => {
    annotations.push(name.split('.').at(-1));
    return ' ';
  });
  const words = bare.replaceAll(WHITESPACE, ' ').trim();
  const match = (kotlin ? KOTLIN_PARAMETER : JAVA_PARAMETER).exec(words);
  if (match === null) {
    return undefined;
  }
  const [name, type] = kotlin ? [match[1], match[2]] : [match[2], match[1]];
  return { annotations, name, type: type.split('.').at(-1) };
}

function bodyOf(code, close, kotlin) {
  const brace = code.indexOf('{', close);
  const equals = kotlin ? code.indexOf('=', close) : -1;
  if (equals !== -1 && (brace === -1 || equals < brace)) {
    const next = EXPRESSION_END.exec(code.slice(close));
    return code.slice(close, next === null ? code.length : close + next.index);
  }
  return brace === -1 ? undefined : code.slice(brace, closingIndex(code, brace) + 1);
}

function classify({ annotations, type }) {
  if (annotations.some((name) => SKIPPED_ANNOTATIONS.has(name))) {
    return undefined;
  }
  if (annotations.includes('RequestParam')) {
    return type === 'String' ? 'param' : undefined;
  }
  const plain = type === 'String' || FRAMEWORK_TYPE.test(type) || NOT_A_FORM_TYPE.test(type);
  return plain ? undefined : 'form';
}

function handlerAt(code, mapping, kotlin) {
  const afterMapping = afterAnnotations(code, mapping.index);
  const open = code.indexOf('(', afterMapping);
  const name =
    open === -1 ? undefined : (FUNCTION_NAME.exec(code.slice(afterMapping, open)) ?? undefined);
  const { close, parts } = open === -1 ? {} : splitArguments(code, open);
  const body = name === undefined ? undefined : bodyOf(code, close + 1, kotlin);
  return body === undefined ? undefined : { method: name[1] ?? name[2], parts, body };
}

function parametersOf(handler, code, kotlin) {
  return handler.parts.flatMap(({ start, end }) => {
    const parameter = parseParameter(code.slice(start, end), kotlin);
    const kind = parameter === undefined ? undefined : classify(parameter);
    const lead = code.slice(start, end).length - code.slice(start, end).trimStart().length;
    return kind === undefined
      ? []
      : [
          {
            method: handler.method,
            kind,
            name: parameter.name,
            offset: start + lead,
            body: handler.body,
          },
        ];
  });
}

export function handlerParameters(code, kotlin) {
  return [...code.matchAll(MAPPING)]
    .map((mapping) => handlerAt(code, mapping, kotlin))
    .filter((handler) => handler !== undefined)
    .flatMap((handler) => parametersOf(handler, code, kotlin));
}
