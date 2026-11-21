export const COPIES = `function readUrl(reader) {
  if (reader.peek() === TOKEN_NULL) {
    reader.nextNull();
    return null;
  }
  const text = reader.nextString();
  return text === 'null' ? null : new URL(text);
}

function readUri(input) {
  if (input.peek() === TOKEN_NULL) {
    input.nextNull();
    return null;
  }
  const value = input.nextString();
  if (value === 'null') {
    return null;
  }
  return new URI(value);
}

function alignTop(elements, state, translate) {
  const selected = state.selection.filter((element) => !element.locked);
  const label = translate('labels.alignTop');
  return render(selected, { icon: AlignTopIcon, label, shortcut: 'CtrlOrCmd+Shift+Up' });
}

function alignBottom(elements, state, translate) {
  const selected = state.selection.filter((element) => !element.locked);
  const label = translate('labels.alignBottom');
  return render(selected, { icon: AlignBottomIcon, label, shortcut: 'CtrlOrCmd+Shift+Down' });
}

function sumWeights(items, scale) {
  let total = 0;
  for (let index = 0; index < items.length; index++) {
    total = total + weigh(items[index], scale);
  }
  record(total, items, scale);
  return total;
}

function addWeights(list, factor) {
  let sum = 0;
  let position = 0;
  while (position < list.length) {
    sum = sum + weigh(list[position], factor);
    position++;
  }
  record(sum, list, factor);
  return sum;
}

function jwtMiddleware(request, options) {
  if (options.disabled) {
    return next(request);
  }
  const header = request.headers.get(options.header);
  const parts = header.split(' ', 2);
  const credentials = decode(parts[1], options.encoding);
  audit.record(credentials, header, request.id);
  return verifyJwt(credentials, options.secret);
}

function jwkMiddleware(request, options) {
  const keys = fetchKeys(options.jwksUri, options.cache);
  const header = request.headers.get(options.header);
  const parts = header.split(' ', 2);
  const credentials = decode(parts[1], options.encoding);
  audit.record(credentials, header, request.id);
  for (const key of keys) {
    if (key.matches(credentials)) {
      return verifyJwk(credentials, key);
    }
  }
  return reject(request);
}
`;
