import { argumentValue } from '../syntax/kotlin-annotations.mjs';

export function classSymbolOf(declaration) {
  const parts = [];
  const pending = [declaration];
  for (const current of pending) {
    parts.unshift(current.name);
    if (current.parent !== undefined) {
      pending.push(current.parent);
    }
  }
  return parts.join('.');
}

function ownerSymbol(owner) {
  return owner === undefined ? '' : `${classSymbolOf(owner)}.`;
}

function parameterSites(file, parameters, scope) {
  return parameters.flatMap((parameter) =>
    parameter.annotations.map((annotation) => ({
      file,
      annotation,
      kind: 'parameter',
      decl: parameter,
      owner: scope.owner,
      symbol: `${scope.symbol}.${parameter.name}`,
    })),
  );
}

function sitesOf(file, kind, { declarations, symbolOf }) {
  return declarations.flatMap((declaration) =>
    declaration.annotations.map((annotation) => ({
      file,
      annotation,
      kind,
      decl: declaration,
      owner: kind === 'class' ? declaration : declaration.owner,
      symbol: symbolOf(declaration),
    })),
  );
}

function annotationSites(file) {
  const constructors = file.classes.flatMap((declaration) =>
    declaration.constructors.map((constructed) => ({ ...constructed, owner: declaration })),
  );
  return [
    ...sitesOf(file, 'class', { declarations: file.classes, symbolOf: classSymbolOf }),
    ...sitesOf(file, 'property', {
      declarations: file.properties.filter((property) => !property.fromConstructor),
      symbolOf: (property) => `${ownerSymbol(property.owner)}${property.name}`,
    }),
    ...sitesOf(file, 'function', {
      declarations: file.functions,
      symbolOf: (declaration) => `${ownerSymbol(declaration.owner)}${declaration.name}`,
    }),
    ...sitesOf(file, 'constructor', {
      declarations: constructors,
      symbolOf: (constructed) => `${classSymbolOf(constructed.owner)}.<init>`,
    }),
    ...file.functions.flatMap((declaration) =>
      parameterSites(file, declaration.params, {
        owner: declaration.owner,
        symbol: `${ownerSymbol(declaration.owner)}${declaration.name}`,
      }),
    ),
    ...constructors.flatMap((constructed) =>
      parameterSites(file, constructed.params, {
        owner: constructed.owner,
        symbol: `${classSymbolOf(constructed.owner)}.<init>`,
      }),
    ),
  ];
}

function isAnnotation(site, names) {
  return site.file.resolver.matches(site.annotation.name, names);
}

export function hasAnnotation(file, declaration, names) {
  return declaration.annotations.some((annotation) =>
    file.resolver.matches(annotation.name, names),
  );
}

export function annotationOn(file, declaration, names) {
  return declaration.annotations.find((annotation) =>
    file.resolver.matches(annotation.name, names),
  );
}

export function sitesOfType(file, names) {
  return annotationSites(file).filter((site) => isAnnotation(site, names));
}

export function hitAt(site) {
  return { node: site.annotation.node, symbol: `${site.symbol}@${site.annotation.name}` };
}

function argumentText(annotation, name) {
  return argumentValue(annotation, name)?.text;
}

export function argumentMatches(annotation, name, pattern) {
  const text = argumentText(annotation, name);
  return text !== undefined && pattern.test(text);
}

export function isTrueArgument(annotation, name) {
  return argumentText(annotation, name) === 'true';
}

export function defineRule(name, text, check) {
  return {
    name,
    message: `${text} If it is right here, add an exception for spring/${name} in nitpicker.config.json.`,
    check,
  };
}

export function hitOn(node, symbol) {
  return { node, symbol };
}

export function isWithin(declaration, ancestor) {
  const pending = [declaration];
  for (const current of pending) {
    if (current === ancestor) {
      return true;
    }
    if (current.parent !== undefined) {
      pending.push(current.parent);
    }
  }
  return false;
}

export function memberSymbolOf(declaration) {
  return `${ownerSymbol(declaration.owner)}${declaration.name}`;
}

export function symbolAround(declaration, node) {
  const inside = declaration.functions.find(
    (member) => member.node.s <= node.s && node.e <= member.node.e,
  );
  return inside === undefined ? classSymbolOf(declaration) : memberSymbolOf(inside);
}
