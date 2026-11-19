from django.db import models
from rest_framework import serializers


class Group(models.Model):
    name = models.CharField(max_length=40)


class Binding(models.Model):
    group = models.ForeignKey(Group, null=True, on_delete=models.CASCADE)


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["name"]


class BindingSerializer(serializers.ModelSerializer):
    group_obj = GroupSerializer(source="group", read_only=True, allow_null=True)

    class Meta:
        model = Binding
        fields = ["group_obj"]
