const HEX_BODY = '(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})';
const HEX = `#${HEX_BODY}(?![\\w-])`;
const HEX_START = '(?<![\\w&#/-])';
const NOT_A_SELECTOR = '(?![^;}]*\\{)';
const FUNCTION_NAMES = '(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)';
const COLOR_SPACES = 'srgb|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?';
const FUNCTION_CALL = `(?:${FUNCTION_NAMES}\\(\\s*[\\d.+-][^)\\]]*\\)|color\\(\\s*(?:${COLOR_SPACES})\\b[^)\\]]*\\))`;
const COLOR_PROPERTY =
  '(?:--[\\w-]+|(?:background|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|column-rule|text-decoration|text-emphasis)(?:-color|-image)?|color|fill|stroke|stop-color|flood-color|lighting-color|caret-color|accent-color|scrollbar-color|box-shadow|text-shadow|filter|mask-image|border-image)';

const longHex = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u;
const shortHex = /^#[0-9a-fA-F]{3,4}$/u;
const wholeFunction = new RegExp(`^${FUNCTION_CALL}$`, 'iu');
const functionCall = new RegExp(`(?<![\\w-])(${FUNCTION_CALL})`, 'iu');
const anyHex = new RegExp(`${HEX_START}(${HEX})`, 'u');
const cssHex = new RegExp(`${HEX_START}(${HEX})${NOT_A_SELECTOR}`, 'u');
const arbitraryValue = new RegExp(`(?<![\\w])[\\w:/-]*-\\[(${HEX}|${FUNCTION_CALL})\\]`, 'iu');
const NAMED_COLOR_PROPERTY =
  '(?:color|background(?:-color)?|border-color|fill|stroke|outline-color|text-decoration-color|caret-color)';

const cssDeclaration = new RegExp(`(?:^|[;{\\s])${COLOR_PROPERTY}\\s*:([^;{}]*)`, 'gu');
const plainDeclaration = new RegExp(`(?:^|[;{])\\s*${COLOR_PROPERTY}\\s*:([^;{}]*)`, 'gu');
const namedColorDeclaration = new RegExp(
  `(?:^|[;{\\s])${NAMED_COLOR_PROPERTY}\\s*:\\s*([a-zA-Z]+)\\s*(?:!important\\s*)?(?=[;}]|$)`,
  'gu',
);
const blockComment = /\/\*[\s\S]*?\*\//gu;
const urlReference = /url\([^)]*\)/giu;

const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
  deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro
  ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
  lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise
  mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab
  orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru
  pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan
  teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/u),
);

function colorIn(text, hexPattern) {
  return (hexPattern.exec(text) ?? functionCall.exec(text))?.[1];
}

function declaredColor(text, declaration) {
  for (const match of text.matchAll(declaration)) {
    const color = colorIn(match[1], anyHex);
    if (color !== undefined) return color;
  }
  return undefined;
}

function declaredNamedColor(text) {
  for (const match of text.matchAll(namedColorDeclaration)) {
    const color = namedColor(match[1]);
    if (color !== undefined) return color;
  }
  return undefined;
}

function wholeColor(text, looseContext) {
  if (longHex.test(text) || wholeFunction.test(text)) return text;
  return looseContext && shortHex.test(text) ? text : undefined;
}

export function findColor(rawText, { whole, css, style, colorPosition }) {
  const withoutUrls = rawText.replaceAll(urlReference, '');
  const text = css ? withoutUrls.replaceAll(blockComment, '') : withoutUrls;
  const looseContext = css || style || colorPosition;
  const wholeMatch = whole ? wholeColor(text.trim(), looseContext) : undefined;
  if (wholeMatch !== undefined) return wholeMatch;
  const embedded = looseContext ? colorIn(text, css ? cssHex : anyHex) : undefined;
  const found =
    embedded ??
    arbitraryValue.exec(text)?.[1] ??
    declaredColor(text, css ? cssDeclaration : plainDeclaration);
  return found ?? (css ? declaredNamedColor(text) : undefined);
}

export function namedColor(text) {
  const name = text.trim().toLowerCase();
  return NAMED_COLORS.has(name) ? name : undefined;
}
