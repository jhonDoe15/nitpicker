import { childrenNamed, parseXml } from '../../ingest/common.mjs';
import { element, renderXml } from './xml-write.mjs';

const REFERENCE = /^(.+?\.xml)(?:\/([^/]+))?$/;
const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const ASSERT_RULE = 'UnitTestShouldIncludeAssert';
const ASSERT_PROPERTY = 'extraAssertMethodNames';

function referenceOf(rule) {
  const match = rule.attrs.ref === undefined ? null : REFERENCE.exec(rule.attrs.ref);
  return match === null
    ? { file: rule.attrs.ref, rule: rule.attrs.name }
    : { file: match[1], rule: match[2] };
}

function excludedNames(rule) {
  return new Set(childrenNamed(rule, 'exclude').map(({ attrs }) => attrs.name));
}

function nitpickerRules(ruleset) {
  const rules = childrenNamed(ruleset, 'rule').map((rule) => ({
    ...referenceOf(rule),
    excluded: excludedNames(rule),
  }));
  const whole = rules.filter(({ rule }) => rule === undefined);
  const named = new Map(
    rules.filter(({ rule }) => rule !== undefined).map(({ file, rule }) => [rule, file]),
  );
  return {
    named,
    has: (file, rule) =>
      named.has(rule) || whole.some((entry) => entry.file === file && !entry.excluded.has(rule)),
    covers: (file) => whole.some((entry) => entry.file === file),
    namedIn: (file) => [...named].filter(([, from]) => from === file).map(([rule]) => rule),
  };
}

function withExcludes(rule, names) {
  const present = excludedNames(rule);
  const added = names.filter((name) => !present.has(name));
  return added.length === 0
    ? rule
    : {
        ...rule,
        children: [...rule.children, ...added.map((name) => element('exclude', { name }))],
      };
}

function splitProjectRule(rule, nitpicker, projectWins) {
  const { file, rule: name } = referenceOf(rule);
  if (name !== undefined) {
    const shadows = nitpicker.has(file, name);
    return {
      kept: projectWins || !shadows ? [rule] : [],
      replaced: shadows && projectWins ? [name] : [],
    };
  }
  return {
    kept: nitpicker.covers(file) ? [] : [withExcludes(rule, nitpicker.namedIn(file))],
    replaced: [],
  };
}

function projectLayer(projectRuleset, nitpicker, projectWins) {
  const project = parseXml(projectRuleset);
  const layers = project.children.map((child) =>
    child.name === 'rule'
      ? splitProjectRule(child, nitpicker, projectWins)
      : { kept: [child], replaced: [] },
  );
  return {
    replaced: [...new Set(layers.flatMap(({ replaced }) => replaced))],
    ruleset: { ...project, children: layers.flatMap(({ kept }) => kept) },
  };
}

function assertionRule(ruleset, helpers) {
  const rule = childrenNamed(ruleset, 'rule').find(({ attrs }) =>
    attrs.ref?.endsWith(`/${ASSERT_RULE}`),
  );
  const properties = rule.children.map((group) => ({
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
  return { ...rule, children: properties };
}

function nitpickerRuleset({ nitpickerPath, ruleset, replaced, helpers }) {
  const withHelpers = helpers.length > 0 && !replaced.includes(ASSERT_RULE);
  const excluded = [...replaced, ...(withHelpers ? [ASSERT_RULE] : [])];
  const description = element('description');
  description.text = "Nitpicker's PMD rules, without the rules the project's ruleset sets itself.";
  const wrapper = element(
    'ruleset',
    { name: 'nitpicker', xmlns: 'http://pmd.sourceforge.net/ruleset/2.0.0' },
    [
      description,
      element(
        'rule',
        { ref: nitpickerPath },
        excluded.map((name) => element('exclude', { name })),
      ),
      ...(withHelpers ? [assertionRule(ruleset, helpers)] : []),
    ],
  );
  return `${DECLARATION}${renderXml(wrapper)}\n`;
}

export function layerPmdRulesets({
  nitpickerPath,
  nitpickerText,
  projectText,
  projectWins = true,
  assertionHelpers = [],
}) {
  const ruleset = parseXml(nitpickerText);
  const nitpicker = nitpickerRules(ruleset);
  const project =
    projectText === undefined ? undefined : projectLayer(projectText, nitpicker, projectWins);
  return {
    nitpicker: nitpickerRuleset({
      nitpickerPath,
      ruleset,
      replaced: project?.replaced ?? [],
      helpers: assertionHelpers,
    }),
    project: project === undefined ? undefined : `${DECLARATION}${renderXml(project.ruleset)}\n`,
    replaced: project?.replaced ?? [],
  };
}
