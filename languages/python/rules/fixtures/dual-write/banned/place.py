from kafka import KafkaProducer

producer = KafkaProducer()


def place(repository, order):
    repository.save(order)
    producer.send("orders", order)
