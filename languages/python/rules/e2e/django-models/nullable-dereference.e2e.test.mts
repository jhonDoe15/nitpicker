import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'lazy-relation-in-loop'],
});

const MODELS = [
  'from django.db import models',
  '',
  '',
  'class Device(models.Model):',
  '    name = models.CharField(max_length=20)',
  '    parent = models.ForeignKey("self", null=True, on_delete=models.CASCADE)',
  '    ordering = models.JSONField(null=True)',
  '    expires = models.DateTimeField(null=True)',
  '    label = models.CharField(max_length=5)',
  '',
];

describe.skipIf(!enabled)('nullable-dereference', () => {
  itOutcomes('flags nullable values used without a guard', [
    [
      'a null=True foreign key read in a model method',
      code(...MODELS, '    def clean(self):', '        return self.parent.name'),
      ['nullable-dereference:12 self.parent|null=True field'],
    ],
    [
      'a null=True JSON field iterated in a model method',
      code(
        ...MODELS,
        '    def clean(self):',
        '        for name in self.ordering:',
        '            print(name)',
      ),
      ['nullable-dereference:12 self.ordering|null=True field'],
    ],
    [
      'a null=True date compared with an ordering operator',
      code(...MODELS, '    def expired(self, now):', '        return self.expires < now'),
      ['nullable-dereference:12 self.expires|null=True field'],
    ],
    [
      'a field read on an instance from get()',
      code(
        ...MODELS,
        '',
        '',
        'def show(pk):',
        '    device = Device.objects.get(pk=pk)',
        '    return device.parent.name',
      ),
      ['nullable-dereference:15 device.parent|null=True field'],
    ],
    [
      'a method called on first() without a check',
      code(
        ...MODELS,
        '',
        '',
        'def show():',
        '    device = Device.objects.filter(name="a").first()',
        '    return device.name',
      ),
      ['nullable-dereference:15 device|.first()'],
    ],
    [
      'an attribute read straight on last()',
      code(
        ...MODELS,
        '',
        '',
        'def show():',
        '    return Device.objects.order_by("name").last().name',
      ),
      ["nullable-dereference:14 Device.objects.order_by('name').last()|.last()"],
    ],
    [
      'a value from cleaned_data.get used with a method call',
      code(
        'def clean(self):',
        '    cleaned = self.cleaned_data',
        '    parent = cleaned.get("device") or cleaned.get("vm")',
        '    parent.snapshot()',
      ),
      ['nullable-dereference:4 parent|.get() without a default'],
    ],
    [
      'an expiry from validated attributes compared with now',
      code('def check(attrs, now):', '    return attrs.get("expires") > now'),
      ["nullable-dereference:2 attrs.get('expires')|.get() without a default"],
    ],
    [
      'a user field read from request.user in a plain view',
      code(
        'from django.http import HttpResponse',
        '',
        '',
        'def view(request):',
        '    return HttpResponse(request.user.email)',
      ),
      ['nullable-dereference:5 request.user|request.user'],
    ],
  ]);

  itOutcomes('reports a queryset whose isnull filter is not constant False', [
    [
      'an isnull value that is a variable',
      code(
        ...MODELS,
        '',
        '',
        'def show(flag):',
        '    for device in Device.objects.filter(parent__isnull=flag):',
        '        print(device.parent.name)',
      ),
      ['nullable-dereference:15 device.parent|null=True field'],
    ],
  ]);

  itOutcomes('stays quiet when a guard or a safe form is present', [
    [
      'an is None early return',
      code(
        ...MODELS,
        '    def clean(self):',
        '        if self.parent is None:',
        '            return None',
        '        return self.parent.name',
      ),
      [],
    ],
    [
      'a truthiness check',
      code(
        ...MODELS,
        '    def clean(self):',
        '        if self.parent:',
        '            return self.parent.name',
      ),
      [],
    ],
    [
      'an and chain',
      code(...MODELS, '    def clean(self):', '        return self.parent and self.parent.name'),
      [],
    ],
    [
      'a conditional expression',
      code(
        ...MODELS,
        '    def clean(self):',
        '        return self.parent.name if self.parent else None',
      ),
      [],
    ],
    [
      'an or fallback for iteration',
      code(
        ...MODELS,
        '    def clean(self):',
        '        for name in self.ordering or ():',
        '            print(name)',
      ),
      [],
    ],
    [
      'a field that is not nullable',
      code(...MODELS, '    def clean(self):', '        return self.label.lower()'),
      [],
    ],
    [
      'a queryset narrowed with isnull=False',
      code(
        ...MODELS,
        '',
        '',
        'def show():',
        '    for device in Device.objects.filter(parent__isnull=False):',
        '        print(device.parent.name)',
      ),
      [],
    ],
    [
      'a first() result that is checked',
      code(
        ...MODELS,
        '',
        '',
        'def show():',
        '    device = Device.objects.filter(name="a").first()',
        '    if not device:',
        '        return None',
        '    return device.name',
      ),
      [],
    ],
    [
      'a get() with a default',
      code('def clean(attrs):', '    parent = attrs.get("parent", None)', '    return parent.name'),
      [],
    ],
    [
      'a dict get with a guard',
      code(
        'def clean(cleaned_data):',
        '    parent = cleaned_data.get("device")',
        '    if parent is not None:',
        '        parent.snapshot()',
      ),
      [],
    ],
    [
      'a request.user use behind login_required',
      code(
        'from django.contrib.auth.decorators import login_required',
        '',
        '',
        '@login_required',
        'def view(request):',
        '    return request.user.email',
      ),
      [],
    ],
    [
      'a request.user use after an is_authenticated check',
      code(
        'from django.http import HttpResponse',
        '',
        '',
        'def view(request):',
        '    if not request.user.is_authenticated:',
        '        return HttpResponse(status=401)',
        '    return HttpResponse(request.user.email)',
      ),
      [],
    ],
    [
      'a field read right after a reassignment',
      code(
        ...MODELS,
        '    def clean(self, other):',
        '        self.parent = other',
        '        return self.parent.name',
      ),
      [],
    ],
    [
      'a truthiness test of the foreign key id',
      code(
        ...MODELS,
        '    def clean(self):',
        '        if self.parent_id:',
        '            return self.parent.name',
      ),
      [],
    ],
    [
      'an is None test of the foreign key id',
      code(
        ...MODELS,
        '    def clean(self):',
        '        if self.parent_id is None:',
        '            return None',
        '        return self.parent.name',
      ),
      [],
    ],
    [
      'a queryset excluding a null foreign key',
      code(
        ...MODELS,
        '',
        '',
        'def show():',
        '    for device in Device.objects.exclude(parent=None):',
        '        print(device.parent.name)',
      ),
      [],
    ],
    [
      'a queryset excluding isnull True',
      code(
        ...MODELS,
        '',
        '',
        'def show():',
        '    for device in Device.objects.exclude(parent__isnull=True):',
        '        print(device.parent.name)',
      ),
      [],
    ],
    [
      'an instance created in the same function',
      code(
        ...MODELS,
        '',
        '',
        'def make():',
        '    device = Device.objects.create(name="a")',
        '    return device.parent.name',
      ),
      [],
    ],
  ]);
});
