import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const RULE = 'signal-receiver-never-connected';
const APPS = (ready: string) =>
  code(
    'from django.apps import AppConfig',
    '',
    '',
    'class ShopConfig(AppConfig):',
    '    name = "shop"',
    '',
    '    def ready(self):',
    ready,
  );
const SIGNALS = code(
  'from django.db.models.signals import post_save',
  'from django.dispatch import receiver',
  '',
  '',
  '@receiver(post_save, sender=Order)',
  'def on_order(sender, **_):',
  '    pass',
);

describe.skipIf(!enabled)('signal-receiver-never-connected', () => {
  itOutcomes('flags receivers in a module that nothing imports', [
    [
      'a signals module with no importer',
      {
        files: {
          'shop/apps.py': APPS('        pass'),
          'shop/signals.py': SIGNALS,
        },
      },
      [`${RULE}:6 on_order|post_save|k0.shop.signals`],
    ],
    [
      'a receivers module that is only imported by tests',
      {
        files: {
          'billing/apps.py': APPS('        pass'),
          'billing/receivers.py': SIGNALS,
          'tests/test_receivers.py': code('from billing import receivers'),
        },
      },
      [`${RULE}:6 on_order|post_save|k1.billing.receivers`],
    ],
  ]);

  itOutcomes('stays quiet when the module is imported', [
    [
      'a relative import in ready',
      {
        files: {
          'a/__init__.py': '',
          'a/apps.py': APPS('        from . import signals'),
          'a/signals.py': SIGNALS,
        },
      },
      [],
    ],
    [
      'an import of the module path in ready',
      {
        files: {
          'b/__init__.py': '',
          'b/apps.py': APPS('        import b.signals'),
          'b/signals.py': SIGNALS,
        },
      },
      [],
    ],
    [
      'an import by name from a module',
      {
        files: {
          'c/__init__.py': '',
          'c/apps.py': APPS('        from c.signals import on_order'),
          'c/signals.py': SIGNALS,
        },
      },
      [],
    ],
    [
      'an import from models',
      {
        files: {
          'd/__init__.py': '',
          'd/apps.py': APPS('        pass'),
          'd/models.py': code('from . import signals'),
          'd/signals.py': SIGNALS,
        },
      },
      [],
    ],
    [
      'import_module with the module path',
      {
        files: {
          'e/__init__.py': '',
          'e/apps.py': code(
            'from importlib import import_module',
            'from django.apps import AppConfig',
            '',
            '',
            'class EConfig(AppConfig):',
            '    def ready(self):',
            '        import_module("e.signals")',
          ),
          'e/signals.py': SIGNALS,
        },
      },
      [],
    ],
    [
      'a signals module without receivers',
      {
        files: {
          'f/apps.py': APPS('        pass'),
          'f/signals.py': code('from django.dispatch import Signal', '', 'order_paid = Signal()'),
        },
      },
      [],
    ],
    [
      'a module whose name is not about signals',
      {
        files: {
          'g/apps.py': APPS('        pass'),
          'g/orders.py': SIGNALS,
        },
      },
      [],
    ],
  ]);

  const dynamic: readonly (readonly [string, string[]])[] = [
    [
      'an import_module call built from the app name',
      [
        'from importlib import import_module',
        'from django.apps import AppConfig',
        '',
        '',
        'class XConfig(AppConfig):',
        '    def ready(self):',
        '        import_module(f"{self.name}.signals")',
      ],
    ],
    [
      'an import_module call with a concatenated name',
      [
        'import importlib',
        'from django.apps import AppConfig',
        '',
        '',
        'class XConfig(AppConfig):',
        '    def ready(self):',
        '        importlib.import_module(self.name + ".signals")',
      ],
    ],
    [
      'autodiscover_modules',
      [
        'from django.apps import AppConfig',
        'from django.utils.module_loading import autodiscover_modules',
        '',
        '',
        'class XConfig(AppConfig):',
        '    def ready(self):',
        '        autodiscover_modules("signals")',
      ],
    ],
  ];
  for (const [name, lines] of dynamic) {
    itOutcomes(`stays quiet for ${name}`, [
      [name, { files: { 'x/apps.py': code(...lines), 'x/signals.py': SIGNALS } }, []],
    ]);
  }

  itOutcomes('stays quiet without an AppConfig', [
    ['a signals module in a project without apps', { files: { 'orders/signals.py': SIGNALS } }, []],
  ]);
});
