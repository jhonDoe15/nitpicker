const ALL = 'ALL';
const PYLINT_GROUP = 'PL';
const PYLINT_LETTERS = /^PL[A-Z]$/u;
const CODE = /^([A-Z]+)(\d*)$/u;
const DEFAULT_SELECT = ['E4', 'E7', 'E9', 'F'];
const GROUP_SPECIFICITY = 1;
const LINTER_SPECIFICITY = 2;

function partsOf(code) {
  const match = CODE.exec(code);
  return match === null ? undefined : { letters: match[1], digits: match[2] };
}

export function ruleCatalog(rules) {
  return rules.map((rule) => ({ ...rule, ...partsOf(rule.code) }));
}

function selectorOf(text) {
  if (text === ALL) {
    return { specificity: 0, matches: () => true };
  }
  const parts = typeof text === 'string' ? partsOf(text) : undefined;
  if (parts === undefined) {
    return undefined;
  }
  if (parts.letters === PYLINT_GROUP && parts.digits === '') {
    return {
      specificity: GROUP_SPECIFICITY,
      matches: (rule) => PYLINT_LETTERS.test(rule.letters),
    };
  }
  return {
    text,
    specificity: LINTER_SPECIFICITY + parts.digits.length,
    matches: (rule) => rule.letters === parts.letters && rule.digits.startsWith(parts.digits),
  };
}

function selectorsOf(texts) {
  return texts.map(selectorOf).filter((selector) => selector !== undefined);
}

export function expandSelectors(texts, catalog) {
  const selectors = selectorsOf(texts);
  return new Set(
    catalog
      .filter((rule) => selectors.some((selector) => selector.matches(rule)))
      .map((rule) => rule.code),
  );
}

function isSelectable(rule, selector, preview) {
  if (rule.preview !== true) {
    return true;
  }
  return preview.enabled && (!preview.explicit || selector.text === rule.code);
}

function setMatching(updates, { selector, catalog, value, preview }) {
  for (const rule of catalog) {
    if (selector.matches(rule) && (!value || isSelectable(rule, selector, preview))) {
      updates.set(rule.code, value);
    }
  }
}

function layerUpdates(selects, ignores, { catalog, preview }) {
  const updates = new Map();
  const specificities = [...new Set([...selects, ...ignores].map((s) => s.specificity))].toSorted(
    (left, right) => left - right,
  );
  for (const specificity of specificities) {
    for (const selector of selects.filter((s) => s.specificity === specificity)) {
      setMatching(updates, { selector, catalog, value: true, preview });
    }
    for (const selector of ignores.filter((s) => s.specificity === specificity)) {
      setMatching(updates, { selector, catalog, value: false, preview });
    }
  }
  return updates;
}

function carriedIgnores(layer) {
  return layer.select?.length === 0 && layer.extendSelect.length === 0 ? layer.ignore : [];
}

export function resolveSelection(layers, { catalog, preview = { enabled: false } }) {
  let enabled = expandSelectors(
    DEFAULT_SELECT,
    catalog.filter((rule) => rule.preview !== true),
  );
  let carried = [];
  for (const layer of layers) {
    const updates = layerUpdates(
      selectorsOf([...(layer.select ?? []), ...layer.extendSelect]),
      selectorsOf([...layer.ignore, ...carried]),
      { catalog, preview },
    );
    if (layer.select !== undefined) {
      enabled = new Set([...updates].filter(([, on]) => on).map(([code]) => code));
    } else {
      for (const [code, on] of updates) {
        if (on) {
          enabled.add(code);
        } else {
          enabled.delete(code);
        }
      }
    }
    carried = carriedIgnores(layer);
  }
  return enabled;
}
