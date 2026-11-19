import { describe } from 'vitest';
import { useRuleScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useRuleScripts('parameter-mutation', { enabled });

describe.skipIf(!enabled)('parameter-mutation reaches into what a parameter holds', () => {
  itOutcomes('reports a change below a parameter', [
    [
      'a loop variable over an attribute',
      code(
        'def to_payload(message):',
        '    for block in message.content:',
        '        block.pop("index")',
      ),
      ['parameter-mutation:3 block.pop (to_payload)'],
    ],
    [
      'an item assigned through a loop variable',
      code(
        'def clean(message):',
        '    for block in message.content:',
        '        block["file"] = None',
      ),
      ['parameter-mutation:3 block[...] (clean)'],
    ],
    [
      'an item of an attribute changed directly',
      code('def add(message, block):', '    message.content[0].append(block)'),
      ['parameter-mutation:2 message.content[...].append (add)'],
    ],
    [
      'a local bound to an attribute',
      code('def merge(first, block):', '    merged = first.content', '    merged.append(block)'),
      ['parameter-mutation:3 merged.append (merge)'],
    ],
    [
      'a mixed chain of items and attributes on a dict parameter',
      code('def hide(widgets: dict):', '    widgets["show"].template_args["actions"].pop("k")'),
      ['parameter-mutation:2 widgets[...].template_args[...].pop (hide)'],
    ],
    [
      'a comprehension variable',
      code('def drop(message):', '    return [block.pop("i") for block in message.content]'),
      ['parameter-mutation:2 block.pop (drop)'],
    ],
    [
      'the values of an attribute and enumerate',
      code(
        'def fill(message):',
        '    for key, value in message.fields.items():',
        '        value.setdefault("a", 1)',
        '    for index, row in enumerate(message.rows):',
        '        row.append(index)',
      ),
      ['parameter-mutation:3 value.setdefault (fill)', 'parameter-mutation:5 row.append (fill)'],
    ],
    [
      'a loop over a parameter that holds collections',
      code('def mark(rows: list[dict[str, int]]):', '    for row in rows:', '        row["x"] = 1'),
      ['parameter-mutation:3 row[...] (mark)'],
    ],
    [
      'a method of a class',
      code(
        'class Builder:',
        '    def build(self, message):',
        '        message.content[0].append(1)',
      ),
      ['parameter-mutation:3 message.content[...].append (Builder.build)'],
    ],
  ]);

  itOutcomes('reports a parameter stored in a container and changed there', [
    [
      'an item stored and updated',
      code(
        'def wrap(schema, key):',
        '    payload = {}',
        '    payload[key] = schema',
        '    payload[key].update({"a": 1})',
      ),
      ['parameter-mutation:4 payload[...].update (wrap)'],
    ],
    [
      'a dict literal holding an attribute',
      code(
        'def wrap(message):',
        '    payload = {"blocks": message.content}',
        '    payload["blocks"].append(1)',
      ),
      ['parameter-mutation:3 payload[...].append (wrap)'],
    ],
  ]);

  itOutcomes('treats a shallow copy as protecting one level', [
    [
      'a nested write below a copy',
      code(
        'def widen(schema: dict):',
        '    clone = dict(schema)',
        '    clone["top"] = 1',
        '    clone["nested"]["k"] = 2',
        '    clone["items"].append(3)',
      ),
      [
        'parameter-mutation:4 clone[...][...] (widen)',
        'parameter-mutation:5 clone[...].append (widen)',
      ],
    ],
    [
      'copy, spread and slice forms',
      code(
        'def widen(schema, rows):',
        '    a = schema.copy()',
        '    a["x"]["y"] = 1',
        '    b = {**schema}',
        '    b["x"].append(1)',
        '    c = rows[:]',
        '    c[0].append(1)',
      ),
      [
        'parameter-mutation:3 a[...][...] (widen)',
        'parameter-mutation:5 b[...].append (widen)',
        'parameter-mutation:7 c[...].append (widen)',
      ],
    ],
  ]);

  itOutcomes('leaves copies, new objects and ambiguous calls alone', [
    [
      'a deep copy and a rebuilt loop variable',
      code(
        'import copy',
        '',
        '',
        'def clean(message):',
        '    own = copy.deepcopy(message.content)',
        '    own.append(1)',
        '    for block in message.content:',
        '        block = {k: v for k, v in block.items() if k != "index"}',
        '        block.pop("x")',
        '    for item in own:',
        '        item.pop("z")',
      ),
      [],
    ],
    [
      'a shallow copy changed at its own level and a deep copy below it',
      code(
        'import copy',
        '',
        '',
        'def widen(schema: dict):',
        '    clone = dict(schema)',
        '    clone["top"] = 1',
        '    clone.update({"a": 1})',
        '    clone = copy.deepcopy(schema)',
        '    clone["nested"]["k"] = 1',
      ),
      [],
    ],
    [
      'a local container that receives an attribute value',
      code(
        'def collect(message):',
        '    out = []',
        '    for block in message.content:',
        '        out.append(block)',
        '    seen = {}',
        '    seen["a"] = message.name',
        '    seen["b"] = 1',
        '    return out, seen',
      ),
      [],
    ],
    [
      'an attribute of a parameter filled directly',
      code(
        'def hand_off(owner, items):',
        '    owner.background.update(items)',
        '    owner.tags.append(1)',
      ),
      [],
    ],
    [
      'a loop over an unannotated parameter',
      code(
        'def touch(items):',
        '    for item in items:',
        '        item.update(x=1)',
        '        item.pop("a")',
      ),
      [],
    ],
    [
      'methods that other objects share: add, remove, clear and keyword update',
      code(
        'def edit(message):',
        '    message.groups.add(1)',
        '    message.tags.remove(1)',
        '    message.items.clear()',
        '    message.qs.update(a=1)',
        '    message.content = []',
        '    message.count += 1',
      ),
      [],
    ],
    [
      'self, private helpers and read-only annotations',
      code(
        'class Box:',
        '    def run(self, other):',
        '        self.items.append(1)',
        '        self.cache["a"] = other.name',
        '',
        '',
        'def _private(message):',
        '    message.content.append(1)',
        '',
        '',
        'def read(message: str, other: tuple, seq: "Sequence[dict]"):',
        '    for x in seq:',
        '        x.pop("a")',
        '    other.content.append(1)',
      ),
      [],
    ],
  ]);
});
