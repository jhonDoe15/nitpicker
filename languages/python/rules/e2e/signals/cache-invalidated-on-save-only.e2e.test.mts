import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const HEADER = [
  'from django.core.cache import cache, caches',
  'from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save',
  'from django.dispatch import receiver',
  '',
  '',
];
const PURGE = code('def purge(rows):', '    rows.delete()');
const RULE = 'cache-invalidated-on-save-only';

describe.skipIf(!enabled)('cache-invalidated-on-save-only', () => {
  itOutcomes('flags a cache cleared on save and never on delete', [
    ['a project that deletes rows', PURGE, []],
    [
      'a Django cache delete_many',
      code(
        ...HEADER,
        '@receiver(post_save, sender=PolicyBinding)',
        'def invalidate_policy_cache(sender, instance, **_):',
        '    cache.delete_many(keys_for(instance))',
      ),
      [`${RULE}:7 invalidate_policy_cache|PolicyBinding|post_save|cache`],
    ],
    [
      'a pre_save receiver that calls an invalidation helper',
      code(
        ...HEADER,
        '@receiver(pre_save, sender=License)',
        'def on_license(sender, instance, **_):',
        '    invalidate_license_cache()',
      ),
      [`${RULE}:7 on_license|License|pre_save|invalidate_license_cache()`],
    ],
    [
      'a helper without a cache word that clears a cache',
      code(
        ...HEADER,
        'def invalidate_tokens():',
        '    cache.delete("tokens")',
        '',
        '',
        '@receiver(post_save, sender=Token)',
        'def on_token(sender, **_):',
        '    invalidate_tokens()',
      ),
      [`${RULE}:11 on_token|Token|post_save|invalidate_tokens()`],
    ],
    [
      'an lru_cache cleared by cache_clear',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Endpoint)',
        'def clear(sender, **_):',
        '    get_endpoints.cache_clear()',
      ),
      [`${RULE}:7 clear|Endpoint|post_save|get_endpoints.cache_clear()`],
    ],
    [
      'a named cache cleared by a pattern, with the sender as a string',
      code(
        ...HEADER,
        '@receiver(post_save, sender="shop.Price")',
        'def drop(sender, **_):',
        '    caches["prices"].delete_pattern("price:*")',
      ),
      [`${RULE}:7 drop|Price|post_save|caches['prices']`],
    ],
    [
      'a receiver connected by the connect call',
      code(
        ...HEADER,
        'def drop_tags(sender, **_):',
        '    cache.clear()',
        '',
        '',
        'post_save.connect(drop_tags, sender=Tag)',
      ),
      [`${RULE}:6 drop_tags|Tag|post_save|cache`],
    ],
    [
      'a delete receiver of another model does not count',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Invoice)',
        'def save_invoice(sender, **_):',
        '    cache.delete("invoices")',
        '',
        '',
        '@receiver(post_delete, sender=Receipt)',
        'def delete_receipt(sender, **_):',
        '    cache.delete("invoices")',
      ),
      [`${RULE}:7 save_invoice|Invoice|post_save|cache`],
    ],
    [
      'a delete receiver that clears another cache does not count',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Quota)',
        'def save_quota(sender, **_):',
        '    cache.delete("quota")',
        '',
        '',
        '@receiver(post_delete, sender=Quota)',
        'def delete_quota(sender, **_):',
        '    caches["other"].delete("quota")',
      ),
      [`${RULE}:7 save_quota|Quota|post_save|cache`],
    ],
  ]);

  itOutcomes('stays quiet when delete clears the same cache', [
    ['a project that deletes rows', PURGE, []],
    [
      'one function on both signals',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Binding)',
        '@receiver(post_delete, sender=Binding)',
        'def invalidate(sender, instance, **_):',
        '    cache.delete_many(keys_for(instance))',
      ),
      [],
    ],
    [
      'a signal list on the decorator',
      code(
        ...HEADER,
        '@receiver([post_save, post_delete], sender=Group)',
        'def invalidate(sender, instance, **_):',
        '    cache.delete("groups")',
      ),
      [],
    ],
    [
      'a separate delete receiver for the same model',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Policy)',
        'def save_policy(sender, **_):',
        '    cache.delete("policy")',
        '',
        '',
        '@receiver(post_delete, sender=Policy)',
        'def delete_policy(sender, **_):',
        '    cache.delete_many(["policy", "other"])',
      ),
      [],
    ],
    [
      'a delete receiver that reaches the cache through a helper',
      code(
        ...HEADER,
        'def drop():',
        '    cache.delete("seat")',
        '',
        '',
        '@receiver(post_save, sender=Seat)',
        'def save_seat(sender, **_):',
        '    cache.delete("seat")',
        '',
        '',
        '@receiver(pre_delete, sender=Seat)',
        'def delete_seat(sender, **_):',
        '    drop()',
      ),
      [],
    ],
    [
      'a receiver connected to both signals',
      code(
        ...HEADER,
        'def drop_label(sender, **_):',
        '    cache.clear()',
        '',
        '',
        'post_save.connect(drop_label, sender=Label)',
        'post_delete.connect(drop_label, sender=Label)',
      ),
      [],
    ],
    [
      'a model whose delete method clears the cache',
      code(
        ...HEADER,
        'class Invoice:',
        '    def delete(self):',
        '        cache.delete("invoices")',
        '',
        '',
        '@receiver(post_save, sender=Invoice)',
        'def on_invoice(sender, **_):',
        '    cache.delete("invoices")',
      ),
      [],
    ],
    [
      'a helper named invalidate that does not touch a cache',
      code(
        ...HEADER,
        '@receiver(post_save, sender=ResetToken)',
        'def on_reset(sender, instance, **_):',
        '    invalidate_reset_tokens(instance)',
      ),
      [],
    ],
    [
      'a connect call that is not a signal',
      code('from sqlite3 import connect', '', '', 'def open_db():', '    return connect("db")'),
      [],
    ],
    [
      'a receiver that does not invalidate',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Visit)',
        'def count_visit(sender, instance, **_):',
        '    cache.set("last", instance.pk)',
        '    instance.notify()',
      ),
      [],
    ],
    [
      'a model named like a cache that is deleted on save',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Draft)',
        'def prune(sender, instance, **_):',
        '    instance.cache_entry.delete()',
        '    entries_cache = []',
        '    entries_cache.append(instance)',
      ),
      [],
    ],
    [
      'a receiver without a sender',
      code(...HEADER, '@receiver(post_save)', 'def drop_all(sender, **_):', '    cache.clear()'),
      [],
    ],
  ]);

  itOutcomes('stays quiet when any delete receiver has no sender', [
    ['a project that deletes rows', PURGE, []],
    [
      'a save receiver and a catch-all delete receiver',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Plan)',
        'def save_plan(sender, **_):',
        '    cache.delete("plan")',
        '',
        '',
        '@receiver(post_delete)',
        'def delete_any(sender, **_):',
        '    cache.delete("plan")',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet when an m2m_changed receiver clears the cache', [
    ['a project that deletes rows', PURGE, []],
    [
      'a save receiver and an m2m_changed receiver',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Team)',
        'def save_team(sender, **_):',
        '    cache.delete("team")',
        '',
        '',
        '@receiver(m2m_changed, sender=Team.members.through)',
        'def members_changed(sender, **_):',
        '    cache.delete("team")',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet when the project never deletes rows', [
    [
      'a save receiver in a project without deletes',
      code(
        ...HEADER,
        '@receiver(post_save, sender=Archive)',
        'def save_archive(sender, **_):',
        '    cache.delete("archive")',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet in test files', [
    ['a project that deletes rows', PURGE, []],
    [
      'a receiver in a test',
      {
        file: 'tests/test_signals.py',
        code: code(
          ...HEADER,
          '@receiver(post_save, sender=Fake)',
          'def save_fake(sender, **_):',
          '    cache.delete("fake")',
        ),
      },
      [],
    ],
  ]);
});
