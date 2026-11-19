from django.db import models
from rest_framework import viewsets


class App(models.Model):
    name = models.CharField(max_length=40)
    slug = models.SlugField()


class Binding(models.Model):
    app = models.ForeignKey(App, on_delete=models.CASCADE)
    title = models.CharField(max_length=40)


class BindingViewSet(viewsets.ModelViewSet):
    queryset = Binding.objects.all()
    search_fields = ["title", "app__name", "app__slug"]
