from django.db import models
from kafka import KafkaProducer


class OutboxRow(models.Model):
    topic = models.CharField(max_length=100)
    payload = models.BinaryField()
    sent = models.BooleanField(default=False)


def relay(producer: KafkaProducer) -> None:
    for row in OutboxRow.objects.filter(sent=False):
        producer.send(row.topic, row.payload)
        row.sent = True
        row.save()
