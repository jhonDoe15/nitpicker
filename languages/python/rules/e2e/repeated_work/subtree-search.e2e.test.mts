import {
  inFile,
  pythonLines,
  ruleLine,
  useRuleScripts,
} from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const SUBTREE_SEARCH = ruleLine('subtree-search-per-ancestor');
const subtreeSearch = useRuleScripts('subtree-search-per-ancestor', { enabled });

subtreeSearch.describeRules('subtree-search-per-ancestor', () => {
  subtreeSearch.itOutcomes('flags subtree searches on every step of a parent-chain climb', [
    [
      'select_one on parent climb',
      pythonLines(
        'def find_scope(start):',
        '    el = start',
        '    while el is not None:',
        '        if el.select_one("[data-scope]"):',
        '            return el',
        '        el = el.parent',
        '    return None',
      ),
      [SUBTREE_SEARCH(4, "el|el.select_one('[data-scope]')")],
    ],
    [
      'for child in get_children with get_parent',
      pythonLines(
        'def find_binding(start, target):',
        '    at = start',
        '    while at is not None:',
        '        for child in at.get_children():',
        '            if child.name == target:',
        '                return child',
        '        at = at.get_parent()',
        '    return None',
      ),
      [SUBTREE_SEARCH(4, 'at|at.get_children()')],
    ],
    [
      'comprehension over children with parent_node',
      pythonLines(
        'def has_child(start, target):',
        '    node = start',
        '    while node is not None:',
        '        if any(c.name == target for c in node.children):',
        '            return node',
        '        node = node.parent_node',
        '    return None',
      ),
      [SUBTREE_SEARCH(4, 'node|node.children')],
    ],
    [
      'ast.walk at every parent level',
      pythonLines(
        'import ast',
        'def inspect_ancestors(start):',
        '    at = start',
        '    while at is not None:',
        '        for child in ast.walk(at):',
        '            if child is None:',
        '                return at',
        '        at = at.parent',
        '    return None',
      ),
      [SUBTREE_SEARCH(5, 'at|ast.walk(at)')],
    ],
    [
      'walrus parent step in while header',
      pythonLines(
        'def find_up(start):',
        '    at = start',
        '    while (at := at.parent) is not None:',
        '        if at.find_all("a"):',
        '            return at',
        '    return None',
      ),
      [SUBTREE_SEARCH(4, "at|at.find_all('a')")],
    ],
  ]);

  subtreeSearch.itOutcomes('allows narrowed, memoized, sibling, and non-climbing walks', [
    [
      'narrowed by while header attribute',
      pythonLines(
        'def find_binding(start, target):',
        '    at = start',
        '    while at is not None and at.kind != "root":',
        '        for child in at.children:',
        '            if child.name == target:',
        '                return child',
        '        at = at.parent',
        '    return None',
      ),
      [],
    ],
    [
      'narrowed by if kind check',
      pythonLines(
        'def find_binding(start, target):',
        '    at = start',
        '    while at is not None:',
        '        if at.kind == "block":',
        '            for child in at.children:',
        '                if child.name == target:',
        '                    return child',
        '        at = at.parent',
        '    return None',
      ),
      [],
    ],
    [
      'narrowed by continue guard',
      pythonLines(
        'def find_heading(start):',
        '    el = start',
        '    while el is not None:',
        '        if el.tag != "SECTION":',
        '            el = el.parent',
        '            continue',
        '        if el.select_one("h2"):',
        '            return el',
        '        el = el.parent',
        '    return None',
      ),
      [],
    ],
    [
      'narrowed by match statement',
      pythonLines(
        'def find_match(start, target):',
        '    at = start',
        '    while at is not None:',
        '        match at.kind:',
        '            case "block":',
        '                for child in at.children:',
        '                    if child.name == target:',
        '                        return child',
        '        at = at.parent',
        '    return None',
      ),
      [],
    ],
    [
      'memoized with cache.get',
      pythonLines(
        'def find_cached(start, cache):',
        '    el = start',
        '    while el is not None:',
        '        if cache.get(el) or el.select_one("[data-scope]"):',
        '            return el',
        '        el = el.parent',
        '    return None',
      ),
      [],
    ],
    [
      'searching another object',
      pythonLines(
        'def find_other(start, other):',
        '    el = start',
        '    while el is not None:',
        '        if other.select_one("[data-scope]"):',
        '            return el',
        '        el = el.parent',
        '    return None',
      ),
      [],
    ],
    [
      'walking siblings',
      pythonLines(
        'def find_sibling(start):',
        '    el = start',
        '    while el is not None:',
        '        if el.select_one("a"):',
        '            return el',
        '        el = el.next_sibling',
        '    return None',
      ),
      [],
    ],
    [
      'nested function inside climbing loop',
      pythonLines(
        'def register_all(start, register):',
        '    at = start',
        '    while at is not None:',
        '        def visit():',
        '            return [c for c in at.children]',
        '        register(visit)',
        '        at = at.parent',
      ),
      [],
    ],
    [
      'test file skipped',
      inFile(
        'tests/test_ancestors.py',
        pythonLines(
          'def test_climb(start):',
          '    el = start',
          '    while el is not None:',
          '        if el.select_one("a"):',
          '            return el',
          '        el = el.parent',
          '    return None',
        ),
      ),
      [],
    ],
  ]);
});
