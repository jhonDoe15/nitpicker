import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const COORDINATOR = [
  'from homeassistant.helpers.update_coordinator import CoordinatorEntity',
  '',
  '',
];

function parts(parent: string, calls: number, skips: number): string[] {
  return Array.from({ length: calls + skips }, (_, index) => [
    `class Part${String(index)}(${parent}):`,
    '    def refresh(self):',
    index < calls ? '        super().refresh()' : '        self.stale = False',
    '        self.fresh = True',
    '',
    '',
  ]).flat();
}

function siblings(library: string, calls: number, skips: number): string[] {
  return [`from ${library} import Entity`, '', '', ...parts('Entity', calls, skips)];
}

function projectSiblings(base: string[], calls: number, skips: number): string[] {
  return [...base, ...parts('Base', calls, skips)];
}

const BASE = ['class Base:', '    def refresh(self):', '        self.count += 1', '', ''];

describe.skipIf(!enabled)('override-without-super', () => {
  itOutcomes('flags a member of a known contract that skips the base member', [
    [
      'a coordinator entity available property',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    @property',
        '    def available(self):',
        '        return self.coordinator.data.online',
      ),
      ['override-without-super:6 Sensor.available|CoordinatorEntity'],
    ],
    [
      'a coordinator entity behind a project base and a generic parameter',
      code(
        ...COORDINATOR,
        'class Base(CoordinatorEntity[Data]):',
        '    pass',
        '',
        '',
        'class Sensor(Base):',
        '    @property',
        '    def available(self):',
        '        return self._attr_available',
      ),
      ['override-without-super:10 Sensor.available|CoordinatorEntity'],
    ],
    [
      'a coordinator entity that reads the private attribute of the base',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    @property',
        '    def available(self):',
        '        return super()._attr_available',
      ),
      ['override-without-super:6 Sensor.available|CoordinatorEntity'],
    ],
    [
      'a coordinator entity async_added_to_hass without the base registration',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    async def async_added_to_hass(self):',
        '        self.restore()',
      ),
      ['override-without-super:5 Sensor.async_added_to_hass|CoordinatorEntity'],
    ],
    [
      'a Django model save that never saves',
      code(
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        self.total = 3',
      ),
      ['override-without-super:5 Order.save|Model'],
    ],
    [
      'a model form clean that drops the base validation',
      code(
        'from django import forms',
        '',
        '',
        'class OrderForm(forms.ModelForm):',
        '    def clean(self):',
        '        return {"a": 1}',
      ),
      ['override-without-super:5 OrderForm.clean|ModelForm'],
    ],
    [
      'a Django test class fixture without the base setup',
      code(
        'from django.test import TestCase',
        '',
        '',
        'class OrderTests(TestCase):',
        '    @classmethod',
        '    def setUpClass(cls):',
        '        cls.value = 1',
      ),
      ['override-without-super:6 OrderTests.setUpClass|TestCase'],
    ],
    [
      'a test fixture that skips the setUp of a project base test case',
      code(
        'import unittest',
        '',
        '',
        'class BaseCase(unittest.TestCase):',
        '    def setUp(self):',
        '        self.client = make_client()',
        '',
        '',
        'class OrderTests(BaseCase):',
        '    def setUp(self):',
        '        self.order = 1',
      ),
      ['override-without-super:10 OrderTests.setUp|BaseCase'],
    ],
  ]);

  itOutcomes('flags the minority of a member that most overrides build on', [
    [
      'one library override out of six',
      code(...siblings('lib_a.base', 5, 1)),
      ['override-without-super:35 Part5.refresh|Entity'],
    ],
    [
      'one project override out of five',
      code(...projectSiblings(BASE, 4, 1)),
      ['override-without-super:31 Part4.refresh|Base'],
    ],
  ]);

  itOutcomes('stays quiet when the base member is called or there is nothing to combine', [
    [
      'a coordinator entity that combines the base member',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    @property',
        '    def available(self):',
        '        return super().available and self.coordinator.data.online',
      ),
      [],
    ],
    [
      'a call with the class and instance spelled out',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    @property',
        '    def available(self):',
        '        return super(Sensor, self).available and self.ready',
      ),
      [],
    ],
    [
      'a call to the base class by name',
      code(
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        models.Model.save(self, *args, **kwargs)',
      ),
      [],
    ],
    [
      'a model save that goes straight to save_base',
      code(
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        self.total = 3',
        '        super().save_base(*args, **kwargs)',
      ),
      [],
    ],
    [
      'a save that goes through self.save_base',
      code(
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        self.total = 3',
        '        self.save_base(*args, **kwargs)',
      ),
      [],
    ],
    [
      'a super object kept in a variable',
      code(
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        parent = super(Order, self)',
        '        parent.save(*args, **kwargs)',
      ),
      [],
    ],
    [
      'a base member fetched with getattr',
      code(
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        getattr(super(), "save")(*args, **kwargs)',
      ),
      [],
    ],
    [
      'an override that only raises',
      code(
        'from django.db import models',
        '',
        '',
        'class Archive(models.Model):',
        '    def save(self, *args, **kwargs):',
        '        raise PermissionError("read only")',
      ),
      [],
    ],
    [
      'an override that returns a constant',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    @property',
        '    def available(self):',
        '        return True',
      ),
      [],
    ],
    [
      'a property setter',
      code(
        ...COORDINATOR,
        'class Sensor(CoordinatorEntity):',
        '    @property',
        '    def available(self):',
        '        return super().available',
        '',
        '    @available.setter',
        '    def available(self, value):',
        '        self._flag = value',
      ),
      [],
    ],
    [
      'a model that does not derive from a known base',
      code('class Order:', '    def save(self):', '        self.total = 3'),
      [],
    ],
    [
      'a plain test case that overrides the empty setUp of unittest',
      code(
        'import unittest',
        '',
        '',
        'class OrderTests(unittest.TestCase):',
        '    def setUp(self):',
        '        self.order = 1',
      ),
      [],
    ],
    [
      'a test case whose project base has an empty setUp',
      code(
        'import unittest',
        '',
        '',
        'class BaseCase(unittest.TestCase):',
        '    def setUp(self):',
        '        pass',
        '',
        '',
        'class OrderTests(BaseCase):',
        '    def setUp(self):',
        '        self.order = 1',
      ),
      [],
    ],
    [
      'a test case that calls the project setUp',
      code(
        'import unittest',
        '',
        '',
        'class BaseCase(unittest.TestCase):',
        '    def setUp(self):',
        '        self.client = make_client()',
        '',
        '',
        'class OrderTests(BaseCase):',
        '    def setUp(self):',
        '        super().setUp()',
        '        self.order = 1',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet below the majority bound', [
    ['four overrides of a library member', code(...siblings('lib_c.base', 3, 1)), []],
    ['five overrides with three that call', code(...siblings('lib_d.base', 3, 2)), []],
    ['twelve overrides with nine that call', code(...siblings('lib_e.base', 9, 3)), []],
    ['five project overrides with three that call', code(...projectSiblings(BASE, 3, 2)), []],
    [
      'a project base that is abstract',
      code(
        ...projectSiblings(
          [
            'import abc',
            '',
            '',
            'class Base(abc.ABC):',
            '    @abc.abstractmethod',
            '    def refresh(self):',
            '        raise NotImplementedError',
            '',
            '',
          ],
          5,
          1,
        ),
      ),
      [],
    ],
    [
      'a project base whose member returns a constant',
      code(
        ...projectSiblings(
          ['class Base:', '    def refresh(self):', '        return None', '', ''],
          5,
          1,
        ),
      ),
      [],
    ],
    [
      'a library member of an opaque typing base',
      code(
        'from typing import Protocol',
        '',
        '',
        'class Base(Protocol):',
        '    def refresh(self): ...',
        '',
        '',
        ...Array.from({ length: 6 }, (_, index) => [
          `class Part${String(index)}(Base):`,
          '    def refresh(self):',
          index < 5 ? '        super().refresh()' : '        self.stale = False',
          '',
          '',
        ]).flat(),
      ),
      [],
    ],
  ]);
});
