from django.db import models


class Node(models.Model):
    parent = models.ForeignKey("self", null=True, on_delete=models.CASCADE)
    name = models.CharField(max_length=40)

    def parent_name(self):
        if self.parent is None:
            return ""
        return self.parent.name
