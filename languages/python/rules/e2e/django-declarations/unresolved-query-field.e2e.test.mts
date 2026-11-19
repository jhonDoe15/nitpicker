import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'lazy-relation-in-loop', 'unindexed-foreign-key'],
});

const MODELS = [
  'from django.db import models',
  '',
  '',
  'class App(models.Model):',
  '    name = models.CharField(max_length=20)',
  '    slug = models.SlugField()',
  '',
  '',
  'class Binding(models.Model):',
  '    app = models.ForeignKey(App, on_delete=models.CASCADE)',
  '    title = models.CharField(max_length=20)',
  '    data = models.JSONField(null=True)',
  '',
  '    @property',
  '    def rank(self):',
  '        return 1',
  '',
  '',
];
const VIEWS = [...MODELS, 'from rest_framework import viewsets', '', ''];
const ADMIN = [...MODELS, 'from django.contrib import admin', '', ''];
const FILTERS = [...MODELS, 'import django_filters', '', ''];

describe.skipIf(!enabled)('unresolved-query-field', () => {
  itOutcomes('flags entries that do not resolve or end at a relation', [
    [
      'a search field naming a foreign key',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    search_fields = ["title", "app"]',
      ),
      ['unresolved-query-field:24 search_fields|app|Binding|relation'],
    ],
    [
      'a search field with a prefix naming a missing field',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    search_fields = ["^name"]',
      ),
      ['unresolved-query-field:24 search_fields|name|Binding|unknown'],
    ],
    [
      'a search path that moved to another model',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.select_related("app")',
        '    search_fields = ["app__title"]',
      ),
      ['unresolved-query-field:24 search_fields|app__title|Binding|unknown'],
    ],
    [
      'an ordering field with a minus sign that does not exist',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    ordering_fields = ["title", "created"]',
        '    ordering = ["-created"]',
      ),
      [
        'unresolved-query-field:24 ordering_fields|created|Binding|unknown',
        'unresolved-query-field:25 ordering|created|Binding|unknown',
      ],
    ],
    [
      'a filterset field of a view that is a property',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    filterset_fields = {"rank": ["exact"], "title": ["exact"]}',
      ),
      ['unresolved-query-field:24 filterset_fields|rank|Binding|unknown'],
    ],
    [
      'a view whose serializer names the model',
      code(
        ...VIEWS,
        'from rest_framework import serializers',
        '',
        '',
        'class BindingSerializer(serializers.ModelSerializer):',
        '    class Meta:',
        '        model = Binding',
        '        fields = "__all__"',
        '',
        '',
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    serializer_class = BindingSerializer',
        '    search_fields = ["missing"]',
      ),
      ['unresolved-query-field:33 search_fields|missing|Binding|unknown'],
    ],
    [
      'an admin class registered with a decorator',
      code(
        ...ADMIN,
        '@admin.register(Binding)',
        'class BindingAdmin(admin.ModelAdmin):',
        '    search_fields = ["app", "title"]',
        '    list_filter = ["app", "state"]',
        '    ordering = ["-position"]',
      ),
      [
        'unresolved-query-field:24 search_fields|app|Binding|relation',
        'unresolved-query-field:25 list_filter|state|Binding|unknown',
        'unresolved-query-field:26 ordering|position|Binding|unknown',
      ],
    ],
    [
      'an admin class registered with the site',
      code(
        ...ADMIN,
        'class BindingAdmin(admin.ModelAdmin):',
        '    list_filter = [("app__name", admin.AllValuesFieldListFilter), "gone"]',
        '',
        '',
        'admin.site.register(Binding, BindingAdmin)',
      ),
      ['unresolved-query-field:23 list_filter|gone|Binding|unknown'],
    ],
    [
      'a filterset meta field and a declared filter path',
      code(
        ...FILTERS,
        'class BindingFilter(django_filters.FilterSet):',
        '    app_name = django_filters.CharFilter(field_name="app__label")',
        '',
        '    class Meta:',
        '        model = Binding',
        '        fields = ["title", "color"]',
      ),
      [
        'unresolved-query-field:23 field_name|app__label|Binding|unknown',
        'unresolved-query-field:27 fields|color|Binding|unknown',
      ],
    ],
    [
      'a reverse path that uses the accessor name instead of the query name',
      code(
        ...VIEWS,
        'class AppViewSet(viewsets.ModelViewSet):',
        '    queryset = App.objects.all()',
        '    search_fields = ["binding_set__title"]',
      ),
      ['unresolved-query-field:24 search_fields|binding_set__title|App|unknown'],
    ],
  ]);

  itOutcomes('stays quiet for resolvable paths and declared names', [
    [
      'related paths, lookups and prefixes',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    search_fields = ["^title", "=app__name", "@app__slug", "$title", "app__name__icontains"]',
        '    ordering_fields = ["title", "app__name", "pk", "app"]',
        '    ordering = ["-title"]',
        '    filterset_fields = {"app": ["exact"], "data__owner": ["exact"]}',
      ),
      [],
    ],
    [
      'a reverse relation and its query name',
      code(
        ...VIEWS,
        'class AppViewSet(viewsets.ModelViewSet):',
        '    queryset = App.objects.all()',
        '    search_fields = ["binding__title"]',
        '    ordering_fields = ["binding"]',
      ),
      [],
    ],
    [
      'a name annotated on the queryset',
      code(
        ...VIEWS,
        'from django.db.models import Count',
        '',
        '',
        'class AppViewSet(viewsets.ModelViewSet):',
        '    queryset = App.objects.all()',
        '    ordering_fields = ["total", "name"]',
        '',
        '    def get_queryset(self):',
        '        return super().get_queryset().annotate(total=Count("binding"))',
      ),
      [],
    ],
    [
      'the all-fields marker and a random ordering',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    ordering_fields = "__all__"',
        '    ordering = ["?"]',
      ),
      [],
    ],
    [
      'a model with a base class that is not in the project',
      code(
        'from django.db import models',
        'from vendor.models import Timestamped',
        'from rest_framework import viewsets',
        '',
        '',
        'class Note(Timestamped):',
        '    body = models.TextField()',
        '',
        '',
        'class NoteViewSet(viewsets.ModelViewSet):',
        '    queryset = Note.objects.all()',
        '    ordering_fields = ["created_at"]',
      ),
      [],
    ],
    [
      'a manager style attribute on the model',
      code(
        'from django.db import models',
        'from taggit.managers import TaggableManager',
        'from rest_framework import viewsets',
        '',
        '',
        'class Note(models.Model):',
        '    tags = TaggableManager()',
        '',
        '',
        'class NoteViewSet(viewsets.ModelViewSet):',
        '    queryset = Note.objects.all()',
        '    filterset_fields = ["tags"]',
      ),
      [],
    ],
    [
      'a filterset field that is a declared filter',
      code(
        ...FILTERS,
        'class BindingFilter(django_filters.FilterSet):',
        '    mine = django_filters.BooleanFilter(method="filter_mine")',
        '',
        '    class Meta:',
        '        model = Binding',
        '        fields = ["title", "mine", "app__name"]',
      ),
      [],
    ],
    [
      'an admin class without a registered model',
      code(...ADMIN, 'class BaseAdmin(admin.ModelAdmin):', '    search_fields = ["anything"]'),
      [],
    ],
    [
      'a declared filter that runs a method',
      code(
        ...FILTERS,
        'class BindingFilter(django_filters.FilterSet):',
        '    q = django_filters.CharFilter(field_name="whatever", method="search")',
        '',
        '    class Meta:',
        '        model = Binding',
        '        fields = ["title"]',
      ),
      [],
    ],
    [
      'an admin class registered for two models',
      code(
        ...ADMIN,
        '@admin.register(Binding, App)',
        'class SharedAdmin(admin.ModelAdmin):',
        '    search_fields = ["name"]',
      ),
      [],
    ],
    [
      'a custom transform after a concrete field',
      code(
        ...VIEWS,
        'class BindingViewSet(viewsets.ModelViewSet):',
        '    queryset = Binding.objects.all()',
        '    search_fields = ["app__name__lower", "title__unaccent_lower"]',
      ),
      [],
    ],
  ]);
});
