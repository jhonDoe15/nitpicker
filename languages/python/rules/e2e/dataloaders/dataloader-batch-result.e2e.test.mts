import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'module-level-mutable-state'],
});

const PROMISE = [
  'from promise.dataloader import DataLoader',
  '',
  '',
  'class ChannelLoader(DataLoader):',
];

describe.skipIf(!enabled)('dataloader-batch-result', () => {
  itOutcomes('flags batch functions that do not return one entry per key', [
    [
      'a dict lookup that raises for a missing key',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {c.pk: c for c in Channel.objects.filter(pk__in=keys)}',
        '        return [by_id[key] for key in keys]',
      ),
      ['dataloader-batch-result:7 ChannelLoader.batch_load|lookup|by_id[key]'],
    ],
    [
      'rows returned in the order the query gave them',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        rows = Channel.objects.filter(pk__in=keys)',
        '        return [row for row in rows]',
      ),
      ['dataloader-batch-result:7 ChannelLoader.batch_load|unmapped|rows'],
    ],
    [
      'a queryset returned directly',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        return Channel.objects.filter(pk__in=keys)',
      ),
      ['dataloader-batch-result:6 ChannelLoader.batch_load|unmapped|rows'],
    ],
    [
      'a dict returned',
      code(
        'from aiodataloader import DataLoader',
        '',
        '',
        'class LineLoader(DataLoader):',
        '    async def batch_load_fn(self, keys):',
        '        rows = await fetch(keys)',
        '        return {row.id: row for row in rows}',
      ),
      ['dataloader-batch-result:7 LineLoader.batch_load_fn|unmapped|dict'],
    ],
    [
      'an empty list when nothing matched',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        rows = list(fetch(keys))',
        '        if not rows:',
        '            return []',
        '        by_id = {row.id: row for row in rows}',
        '        return [by_id.get(key) for key in keys]',
      ),
      ['dataloader-batch-result:8 ChannelLoader.batch_load|empty|[]'],
    ],
    [
      'a lookup in a result list that is returned later',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_slug = {row.slug: row for row in fetch(keys)}',
        '        result = [by_slug[slug] for slug in keys]',
        '        return result',
      ),
      ['dataloader-batch-result:7 ChannelLoader.batch_load|lookup|by_slug[slug]'],
    ],
    [
      'a lookup inside a loop that appends',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        result = []',
        '        for key in keys:',
        '            result.append(by_id[key])',
        '        return result',
      ),
      ['dataloader-batch-result:9 ChannelLoader.batch_load|lookup|by_id[key]'],
    ],
    [
      'a lookup in a map over the keys',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        return list(map(lambda key: by_id[key], keys))',
      ),
      ['dataloader-batch-result:7 ChannelLoader.batch_load|lookup|by_id[key]'],
    ],
    [
      'a function given to a Strawberry DataLoader',
      code(
        'from strawberry.dataloader import DataLoader',
        '',
        '',
        'async def load_users(keys):',
        '    by_id = {user.id: user for user in await fetch(keys)}',
        '    return [by_id[key] for key in keys]',
        '',
        '',
        'loader = DataLoader(load_fn=load_users)',
      ),
      ['dataloader-batch-result:6 load_users|lookup|by_id[key]'],
    ],
    [
      'a loader that derives from a project loader base',
      {
        files: {
          'shop/__init__.py': '',
          'shop/base.py': code(
            'from promise.dataloader import DataLoader',
            '',
            '',
            'class Base(DataLoader):',
            '    pass',
          ),
          'shop/loaders.py': code(
            'from shop.base import Base',
            '',
            '',
            'class VoucherLoader(Base):',
            '    def batch_load(self, keys):',
            '        found = {v.code: v for v in fetch(keys)}',
            '        return [found[key] for key in keys]',
          ),
        },
      },
      ['dataloader-batch-result:7 VoucherLoader.batch_load|lookup|found[key]'],
    ],
  ]);

  itOutcomes('stays quiet for the allowed forms and for other code', [
    [
      'get with None for a missing key',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {c.pk: c for c in Channel.objects.filter(pk__in=keys)}',
        '        return [by_id.get(key) for key in keys]',
      ),
      [],
    ],
    [
      'a list of None for every key and an empty keys guard',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        if not keys:',
        '            return []',
        '        rows = fetch(keys)',
        '        return [None] * len(keys)',
      ),
      [],
    ],
    [
      'a lookup guarded by a membership test',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        return [by_id[key] if key in by_id else None for key in keys]',
      ),
      [],
    ],
    [
      'a lookup in a map that every key fills first',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        groups = defaultdict(list)',
        '        for row in fetch(keys):',
        '            groups[row.owner_id].append(row)',
        '        return [groups[key] for key in keys]',
      ),
      [],
    ],
    [
      'a dict built from the keys',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        found = {key: [] for key in keys}',
        '        for row in fetch(keys):',
        '            found[row.owner_id].append(row)',
        '        return [found[key] for key in keys]',
      ),
      [],
    ],
    [
      'a loop that checks each key before reading',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        result = []',
        '        for key in keys:',
        '            if key in by_id:',
        '                result.append(by_id[key])',
        '            else:',
        '                result.append(None)',
        '        return result',
      ),
      [],
    ],
    [
      'a method of a class that is not a DataLoader',
      code(
        'class Plain:',
        '    def batch_load(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        return [by_id[key] for key in keys]',
      ),
      [],
    ],
    [
      'another method of a DataLoader',
      code(
        ...PROMISE,
        '    def helper(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        return [by_id[key] for key in keys]',
      ),
      [],
    ],
    [
      'results gathered from one call per key',
      code(
        'import asyncio',
        'from aiodataloader import DataLoader',
        '',
        '',
        'class LineLoader(DataLoader):',
        '    async def batch_load_fn(self, keys):',
        '        results = await asyncio.gather(*(self.fetch(k) for k in keys))',
        '        return [r.data for r in results]',
      ),
      [],
    ],
    [
      'a dict prefilled in a loop over the keys',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {}',
        '        for key in keys:',
        '            by_id[key] = None',
        '        for row in fetch(keys):',
        '            by_id[row.id] = row',
        '        return [by_id[key] for key in keys]',
      ),
      [],
    ],
    [
      'a lookup returned inside a try that catches KeyError',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        by_id = {row.id: row for row in fetch(keys)}',
        '        try:',
        '            return [by_id[key] for key in keys]',
        '        except KeyError:',
        '            return [None] * len(keys)',
      ),
      [],
    ],
    [
      'a result built by a helper',
      code(
        ...PROMISE,
        '    def batch_load(self, keys):',
        '        return self.ordered(keys, fetch(keys))',
      ),
      [],
    ],
  ]);
});
