from django.db import models
from rest_framework import serializers


class Device(models.Model):
    name = models.CharField(max_length=40)
    serial = models.CharField(max_length=40)


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["name", "serial"]


class DeviceDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["name", "serial"]


class DeviceAllSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = "__all__"


class DeviceShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["name"]
