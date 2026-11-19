import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'unindexed-foreign-key', 'lazy-relation-in-loop'],
});

const MODEL = [
  'from django.db import models',
  'from rest_framework import serializers',
  '',
  '',
  'class Device(models.Model):',
  '    name = models.CharField(max_length=20)',
  '    serial = models.CharField(max_length=20)',
  '    notes = models.TextField()',
  '',
  '',
];

function serializer(name: string, fields: string, extra = ''): string[] {
  return [
    `class ${name}(serializers.ModelSerializer):`,
    '    class Meta:',
    '        model = Device',
    `        ${extra === '' ? `fields = ${fields}` : extra}`,
    '',
    '',
  ];
}

const PEERS = [
  ...serializer('DeviceSerializer', '["name", "serial", "notes"]'),
  ...serializer('DeviceDetailSerializer', '["name", "serial", "notes"]'),
  ...serializer('DeviceAllSerializer', '"__all__"'),
];

describe.skipIf(!enabled)('serializer-fields-omitted', () => {
  itOutcomes('flags a serializer that omits a field the other serializers expose', [
    [
      'a list that leaves out a shared field',
      code(...MODEL, ...PEERS, ...serializer('DeviceShortSerializer', '["name", "notes"]')),
      ['serializer-fields-omitted:32 serial|DeviceShortSerializer|Device'],
    ],
  ]);

  itOutcomes('stays quiet for variants, small groups and exclusions', [
    [
      'a brief variant',
      code(...MODEL, ...PEERS, ...serializer('BriefDeviceSerializer', '["name"]')),
      [],
    ],
    [
      'a nested variant',
      code(...MODEL, ...PEERS, ...serializer('NestedDeviceSerializer', '["name"]')),
      [],
    ],
    [
      'a write-only variant',
      code(...MODEL, ...PEERS, ...serializer('DeviceWriteSerializer', '["name"]')),
      [],
    ],
    [
      'an exclude based serializer',
      code(
        ...MODEL,
        ...PEERS,
        ...serializer('DeviceExcludeSerializer', '', 'exclude = ["serial"]'),
      ),
      [],
    ],
    [
      'fewer than three other serializers',
      code(
        ...MODEL,
        ...serializer('DeviceSerializer', '["name", "serial", "notes"]'),
        ...serializer('DeviceAllSerializer', '"__all__"'),
        ...serializer('DeviceShortSerializer', '["name"]'),
      ),
      [],
    ],
    [
      'a field that fewer than most of the other serializers expose',
      code(
        ...MODEL,
        ...serializer('DeviceSerializer', '["name", "serial"]'),
        ...serializer('DeviceDetailSerializer', '["name", "notes"]'),
        ...serializer('DeviceThirdSerializer', '["name"]'),
        ...serializer('DeviceShortSerializer', '["name"]'),
      ),
      [],
    ],
    [
      'a list with every shared field',
      code(
        ...MODEL,
        ...PEERS,
        ...serializer('DeviceFullSerializer', '["name", "serial", "notes"]'),
      ),
      [],
    ],
  ]);
});
