import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'lazy-relation-in-loop', 'unindexed-foreign-key'],
});

const MODELS = [
  'import django_filters',
  'from django.db import models',
  '',
  '',
  'class Provider(models.Model):',
  '    name = models.CharField(max_length=20)',
  '    slug = models.SlugField(unique=True)',
  '',
  '',
  'class ProviderAccount(models.Model):',
  '    provider = models.ForeignKey(Provider, on_delete=models.CASCADE)',
  '    account = models.CharField(max_length=20)',
  '',
  '',
  'class Circuit(models.Model):',
  '    provider_account = models.ForeignKey(ProviderAccount, on_delete=models.CASCADE)',
  '    peers = models.ManyToManyField(Provider)',
  '',
  '',
  'class PremiumAccount(ProviderAccount):',
  '    tier = models.IntegerField()',
  '',
  '',
];

function filterSet(...lines: string[]): string {
  return code(
    ...MODELS,
    'class CircuitFilterSet(django_filters.FilterSet):',
    ...lines,
    '',
    '    class Meta:',
    '        model = Circuit',
    '        fields = ["provider_account"]',
  );
}

describe.skipIf(!enabled)('filter-model-mismatch', () => {
  itOutcomes('flags a queryset of another model and a missing to_field_name', [
    [
      'a filter that uses the queryset of the wrong model',
      filterSet(
        '    provider_account_id = django_filters.ModelMultipleChoiceFilter(',
        '        queryset=Provider.objects.all()',
        '    )',
      ),
      ['filter-model-mismatch:25 provider_account_id|Provider|ProviderAccount'],
    ],
    [
      'a filter with an explicit field name and the wrong queryset',
      filterSet(
        '    account = django_filters.ModelChoiceFilter(',
        '        field_name="provider_account", queryset=Provider.objects.filter(name="a")',
        '    )',
      ),
      ['filter-model-mismatch:25 account|Provider|ProviderAccount'],
    ],
    [
      'a many-to-many filter that uses the owner queryset',
      filterSet(
        '    peers = django_filters.ModelMultipleChoiceFilter(queryset=Circuit.objects.all())',
      ),
      ['filter-model-mismatch:25 peers|Circuit|Provider'],
    ],
    [
      'a to_field_name that is not a field of the queryset model',
      filterSet(
        '    provider_account = django_filters.ModelChoiceFilter(',
        '        queryset=ProviderAccount.objects.all(), to_field_name="code"',
        '    )',
      ),
      ['filter-model-mismatch:25 provider_account|ProviderAccount|code|to_field_name'],
    ],
  ]);

  itOutcomes('stays quiet when the queryset matches the relation', [
    [
      'the queryset of the related model',
      filterSet(
        '    provider_account = django_filters.ModelMultipleChoiceFilter(',
        '        queryset=ProviderAccount.objects.all(), to_field_name="account"',
        '    )',
      ),
      [],
    ],
    [
      'a to_field_name of pk and of the slug field',
      filterSet(
        '    peers = django_filters.ModelMultipleChoiceFilter(',
        '        queryset=Provider.objects.all(), to_field_name="slug"',
        '    )',
        '    other = django_filters.ModelChoiceFilter(',
        '        field_name="peers", queryset=Provider.objects.all(), to_field_name="pk"',
        '    )',
      ),
      [],
    ],
    [
      'a queryset of a subclass of the related model',
      filterSet(
        '    provider_account = django_filters.ModelChoiceFilter(',
        '        queryset=PremiumAccount.objects.all()',
        '    )',
      ),
      [],
    ],
    [
      'a related path that ends at another model',
      filterSet(
        '    provider = django_filters.ModelChoiceFilter(',
        '        field_name="provider_account__provider", queryset=Provider.objects.all()',
        '    )',
      ),
      [],
    ],
    [
      'a filter whose name is no relation of the model',
      filterSet('    owner = django_filters.ModelChoiceFilter(queryset=Provider.objects.all())'),
      [],
    ],
    [
      'a queryset that is not a model manager chain',
      filterSet('    provider_account = django_filters.ModelChoiceFilter(queryset=get_accounts)'),
      [],
    ],
  ]);
});
