import { childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';
import { element, renderXml } from './xml-write.mjs';

const REFERENCE = /^(.+?\.xml)(?:\/([^/]+))?$/;
const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const CHILD_ORDER = ['description', 'priority', 'properties', 'exclude', 'example'];
const ASSERT_RULE = 'UnitTestShouldIncludeAssert';
const ASSERT_PROPERTY = 'extraAssertMethodNames';

function referenceOf(rule) {
  const match = REFERENCE.exec(rule.attrs.ref ?? '');
  return match === null
    ? { file: rule.attrs.ref, rule: rule.attrs.name }
    : { file: match[1], rule: match[2] };
}

function excludedNames(rule) {
  return new Set(childrenNamed(rule, 'exclude').map(({ attrs }) => attrs.name));
}

function withHelpers(rule, helpers) {
  const groups = rule.children.map((group) => ({
    ...group,
    children: group.children.map((property) =>
      property.attrs.name === ASSERT_PROPERTY
        ? {
            ...property,
            attrs: {
              ...property.attrs,
              value: [
                ...new Set([
                  ...(property.attrs.value ?? '').split(',').filter(Boolean),
                  ...helpers,
                ]),
              ].join(','),
            },
          }
        : property,
    ),
  }));
  return { ...rule, children: groups };
}

function scopedRulesOf(ruleset) {
  return childrenNamed(ruleset, 'rule').map((rule) => ({
    ...referenceOf(rule),
    element: rule,
  }));
}

function catalogOf({ ruleset, helpers, testRuleset, mainRuleset }) {
  const definitions = new Map();
  const covers = new Map();
  const mainCovers = new Map();
  for (const { file, rule, element: definition } of scopedRulesOf(testRuleset)) {
    definitions.set(rule, { file, element: definition, testOnly: true });
  }
  for (const { file, rule, element: definition } of scopedRulesOf(mainRuleset)) {
    if (rule === undefined) {
      mainCovers.set(file, excludedNames(definition));
    } else {
      definitions.set(rule, { file, element: definition, mainOnly: true });
    }
  }
  for (const rule of childrenNamed(ruleset, 'rule')) {
    const { file, rule: name } = referenceOf(rule);
    if (name === undefined) {
      covers.set(file, excludedNames(rule));
    } else {
      definitions.set(name, {
        file,
        element: name === ASSERT_RULE && helpers.length > 0 ? withHelpers(rule, helpers) : rule,
      });
    }
  }
  return { definitions, covers, mainCovers };
}

function covered(covers, file, name) {
  return covers.has(file) && !covers.get(file).has(name);
}

function runsRule({ definitions, covers }, file, name) {
  return definitions.has(name) || covered(covers, file, name);
}

function mergedProperties(base, over) {
  const names = new Set(over.map(({ attrs }) => attrs.name));
  return [...base.filter(({ attrs }) => !names.has(attrs.name)), ...over];
}

function mergedChildren(base, over, name) {
  const left = childrenNamed(base, name);
  const right = childrenNamed(over, name);
  if (name === 'properties') {
    const properties = mergedProperties(
      left.flatMap((group) => group.children),
      right.flatMap((group) => group.children),
    );
    return properties.length === 0 ? [] : [element('properties', {}, properties)];
  }
  if (name === 'exclude') {
    const names = new Set(right.map(({ attrs }) => attrs.name));
    return [...left.filter(({ attrs }) => !names.has(attrs.name)), ...right];
  }
  return right.length > 0 ? right : left;
}

function overlay(base, over) {
  if ((base.attrs.ref === undefined) !== (over.attrs.ref === undefined)) {
    return over;
  }
  const present = new Set([...base.children, ...over.children].map(({ name }) => name));
  const names = [
    ...CHILD_ORDER.filter((name) => present.has(name)),
    ...[...present].filter((name) => !CHILD_ORDER.includes(name)),
  ];
  return {
    ...base,
    attrs: { ...base.attrs, ...over.attrs },
    children: names.flatMap((name) => mergedChildren(base, over, name)),
  };
}

function wholeCategory({ rule, file, catalog }) {
  const covers = catalog.covers.has(file) ? catalog.covers : catalog.mainCovers;
  if (!covers.has(file)) {
    const named = [...catalog.definitions].filter(([, entry]) => entry.file === file);
    const present = excludedNames(rule);
    const added = named.map(([name]) => name).filter((name) => !present.has(name));
    return added.length === 0
      ? rule
      : {
          ...rule,
          children: [...rule.children, ...added.map((name) => element('exclude', { name }))],
        };
  }
  const own = excludedNames(rule);
  return [...covers.get(file)]
    .filter((name) => !catalog.definitions.has(name) && !own.has(name))
    .map((name) => element('rule', { ref: `${file}/${name}` }));
}

function splitProjectRule(rule, catalog, projectWins) {
  const { file, rule: name } = referenceOf(rule);
  if (name === undefined) {
    return { kept: [wholeCategory({ rule, file, catalog })].flat(), replaced: [] };
  }
  const definition = catalog.definitions.get(name);
  if (definition === undefined) {
    return covered(catalog.mainCovers, file, name)
      ? { kept: [], replaced: [], main: [[name, rule]] }
      : { kept: [rule], replaced: runsRule(catalog, file, name) ? [name] : [] };
  }
  const merged = projectWins
    ? overlay(definition.element, rule)
    : overlay(rule, definition.element);
  if (definition.testOnly) {
    return { kept: [], replaced: [], tests: [[name, merged]] };
  }
  return definition.mainOnly
    ? { kept: [], replaced: [], main: [[name, merged]] }
    : { kept: [merged], replaced: [name] };
}

function projectLayer(projectRuleset, catalog, projectWins) {
  const project = parseXml(projectRuleset);
  const layers = project.children.map((child) =>
    child.name === 'rule'
      ? splitProjectRule(child, catalog, projectWins)
      : { kept: [child], replaced: [] },
  );
  return {
    tests: new Map(layers.flatMap(({ tests = [] }) => tests)),
    main: new Map(layers.flatMap(({ main = [] }) => main)),
    replaced: [...new Set(layers.flatMap(({ replaced }) => replaced))],
    ruleset: { ...project, children: layers.flatMap(({ kept }) => kept) },
  };
}

function wrapperRuleset({ name, text, path, excluded, rules }) {
  const description = element('description');
  description.text = text;
  const wrapper = element('ruleset', { name, xmlns: 'http://pmd.sourceforge.net/ruleset/2.0.0' }, [
    description,
    element(
      'rule',
      { ref: path },
      excluded.map((rule) => element('exclude', { name: rule })),
    ),
    ...rules,
  ]);
  return `${DECLARATION}${renderXml(wrapper)}\n`;
}

function nitpickerRuleset({ nitpickerPath, catalog, replaced, helpers }) {
  const withAssertion = helpers.length > 0 && !replaced.includes(ASSERT_RULE);
  return wrapperRuleset({
    name: 'nitpicker',
    text: "Nitpicker's PMD rules, without the rules the project's ruleset sets itself.",
    path: nitpickerPath,
    excluded: [...replaced, ...(withAssertion ? [ASSERT_RULE] : [])],
    rules: withAssertion ? [catalog.definitions.get(ASSERT_RULE).element] : [],
  });
}

function mainRuleset(mainPath, overlaid) {
  return wrapperRuleset({
    name: 'nitpicker-main-rules',
    text: "Nitpicker's main-only PMD rules, with the project's settings over them.",
    path: mainPath,
    excluded: [...overlaid.keys()],
    rules: [...overlaid.values()],
  });
}

function testRuleset(catalog, overlaid) {
  const description = element('description');
  description.text = "Nitpicker's test-only PMD rules, with the project's settings over them.";
  const rules = [...catalog.definitions]
    .filter(([, entry]) => entry.testOnly)
    .map(([name, entry]) => overlaid.get(name) ?? entry.element);
  const wrapper = element(
    'ruleset',
    { name: 'nitpicker-test-rules', xmlns: 'http://pmd.sourceforge.net/ruleset/2.0.0' },
    [description, ...rules],
  );
  return `${DECLARATION}${renderXml(wrapper)}\n`;
}

export function layerPmdRulesets({
  nitpickerPath,
  nitpickerText,
  testText,
  mainPath,
  mainText,
  projectText,
  projectWins = true,
  assertionHelpers = [],
}) {
  const catalog = catalogOf({
    ruleset: parseXml(nitpickerText),
    helpers: assertionHelpers,
    testRuleset: parseXml(testText),
    mainRuleset: parseXml(mainText),
  });
  const project =
    projectText === undefined ? undefined : projectLayer(projectText, catalog, projectWins);
  return {
    tests: project === undefined ? undefined : testRuleset(catalog, project.tests),
    main: project === undefined ? undefined : mainRuleset(mainPath, project.main),
    nitpicker: nitpickerRuleset({
      nitpickerPath,
      catalog,
      replaced: project?.replaced ?? [],
      helpers: assertionHelpers,
    }),
    project: project === undefined ? undefined : `${DECLARATION}${renderXml(project.ruleset)}\n`,
    replaced: project?.replaced ?? [],
  };
}
