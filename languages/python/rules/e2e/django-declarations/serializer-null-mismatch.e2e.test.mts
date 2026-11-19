import { describe } from 'vitest';
import { code, declaredClass, useDeclarationScripts } from './declaration-support.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useDeclarationScripts(enabled);

const MODELS = [
  `from django.db import models
from rest_framework import serializers


class Group(models.Model):
    name = models.CharField(max_length=20)


class Binding(models.Model):
    group = models.ForeignKey(Group, null=True, on_delete=models.CASCADE)
    owner = models.ForeignKey(Group, related_name="owned", on_delete=models.CASCADE)
    note = models.CharField(max_length=20, blank=True)
    order = models.IntegerField(default=0)
    title = models.CharField(max_length=20)
    tags = models.ManyToManyField(Group, related_name="tagged")


class Detail(models.Model):
    binding = models.OneToOneField(Binding, on_delete=models.CASCADE)


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["name"]

`,
];

function serializer(...lines: string[]): string {
  return declaredClass({
    models: MODELS,
    header: 'class BindingSerializer(serializers.ModelSerializer):',
    body: lines,
    meta: ['        model = Binding', '        fields = "__all__"'],
  });
}

describe.skipIf(!enabled)('serializer-null-mismatch', () => {
  itOutcomes('flags settings that disagree with the model or the method', [
    [
      'a nested read-only serializer for a nullable foreign key',
      serializer('    group_obj = GroupSerializer(source="group", read_only=True)'),
      ['serializer-null-mismatch:29 group_obj|Binding|null'],
    ],
    [
      'a related field named like a nullable foreign key',
      serializer('    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())'),
      ['serializer-null-mismatch:29 group|Binding|null'],
    ],
    [
      'a path through a nullable foreign key',
      serializer('    group_name = serializers.CharField(source="group.name", read_only=True)'),
      ['serializer-null-mismatch:29 group_name|Binding|null'],
    ],
    [
      'a reverse one-to-one relation that may be missing',
      code(
        ...MODELS,
        'class GroupBindingSerializer(serializers.ModelSerializer):',
        '    detail = serializers.PrimaryKeyRelatedField(read_only=True)',
        '',
        '    class Meta:',
        '        model = Binding',
        '        fields = "__all__"',
      ),
      ['serializer-null-mismatch:29 detail|Binding|null'],
    ],
    [
      'a field that is required by default for a blank column',
      serializer('    note = serializers.CharField(max_length=20)'),
      ['serializer-null-mismatch:29 note|Binding|required'],
    ],
    [
      'a field that is required by default for a column with a default',
      serializer('    order = serializers.IntegerField()'),
      ['serializer-null-mismatch:29 order|Binding|required'],
    ],
    [
      'a method field that returns None',
      serializer(
        '    label = serializers.SerializerMethodField()',
        '',
        '    def get_label(self, obj):',
        '        if not obj.title:',
        '            return None',
        '        return obj.title',
      ),
      ['serializer-null-mismatch:29 label|BindingSerializer|method'],
    ],
    [
      'a method field with a bare return',
      serializer(
        '    label = serializers.SerializerMethodField()',
        '',
        '    def get_label(self, obj):',
        '        if obj.title:',
        '            return obj.title',
        '        return',
      ),
      ['serializer-null-mismatch:29 label|BindingSerializer|method'],
    ],
    [
      'an optional method that a schema extension makes non-null',
      code(
        'from drf_spectacular.utils import extend_schema_field',
        ...MODELS,
        'class BindingSerializer(serializers.ModelSerializer):',
        '    label = serializers.SerializerMethodField()',
        '',
        '    @extend_schema_field(serializers.CharField())',
        '    def get_label(self, obj) -> str | None:',
        '        return obj.title',
        '',
        '    class Meta:',
        '        model = Binding',
        '        fields = "__all__"',
      ),
      ['serializer-null-mismatch:30 label|BindingSerializer|method'],
    ],
  ]);

  itOutcomes('stays quiet when the settings match', [
    [
      'allow_null on a nested serializer',
      serializer(
        '    group_obj = GroupSerializer(source="group", read_only=True, allow_null=True)',
        '    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all(), allow_null=True)',
      ),
      [],
    ],
    [
      'a required foreign key and its nested serializer',
      serializer(
        '    owner_obj = GroupSerializer(source="owner", read_only=True)',
        '    title = serializers.CharField()',
      ),
      [],
    ],
    [
      'a many-to-many field and a many nested serializer',
      serializer(
        '    tags = GroupSerializer(many=True, read_only=True)',
        '    tag_ids = serializers.PrimaryKeyRelatedField(many=True, queryset=Group.objects.all())',
      ),
      [],
    ],
    [
      'optional settings for blank and default columns',
      serializer(
        '    note = serializers.CharField(max_length=20, required=False)',
        '    order = serializers.IntegerField(default=0)',
        '    shown = serializers.IntegerField(source="order", read_only=True)',
      ),
      [],
    ],
    [
      'an explicit required setting',
      serializer('    note = serializers.CharField(required=True)'),
      [],
    ],
    [
      'extra_kwargs and automatic fields',
      code(
        ...MODELS,
        'class BindingSerializer(serializers.ModelSerializer):',
        '    class Meta:',
        '        model = Binding',
        '        fields = ["group", "note"]',
        '        extra_kwargs = {"group": {"allow_null": True}}',
      ),
      [],
    ],
    [
      'a method field that always returns a value',
      serializer(
        '    label = serializers.SerializerMethodField()',
        '',
        '    def get_label(self, obj):',
        '        return obj.title',
      ),
      [],
    ],
    [
      'a method field that returns None with an Optional annotation',
      serializer(
        '    label = serializers.SerializerMethodField()',
        '',
        '    def get_label(self, obj) -> str | None:',
        '        return None',
      ),
      [],
    ],
    [
      'a method field with a nullable schema extension',
      code(
        'from drf_spectacular.utils import extend_schema_field',
        ...MODELS,
        'class BindingSerializer(serializers.ModelSerializer):',
        '    label = serializers.SerializerMethodField()',
        '',
        '    @extend_schema_field(serializers.CharField(allow_null=True))',
        '    def get_label(self, obj):',
        '        return None',
        '',
        '    class Meta:',
        '        model = Binding',
        '        fields = "__all__"',
      ),
      [],
    ],
    [
      'a method field declared with allow_null',
      serializer(
        '    label = serializers.SerializerMethodField(allow_null=True)',
        '',
        '    def get_label(self, obj):',
        '        return None',
      ),
      [],
    ],
    [
      'a name that is not a field of the model',
      serializer('    extra = serializers.CharField(source="compute", read_only=True)'),
      [],
    ],
    [
      'a field call that forwards keyword options',
      serializer('    group = serializers.PrimaryKeyRelatedField(**OPTIONS)'),
      [],
    ],
    [
      'a default on a source path through a nullable foreign key',
      serializer('    group_name = serializers.CharField(source="group.name", default="")'),
      [],
    ],
  ]);
});
