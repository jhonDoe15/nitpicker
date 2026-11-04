import queue
from queue import Queue

from app.queue import Queue as LocalQueue


def feed(first: Queue, second: queue.Queue, third: LocalQueue) -> None:
    first.put(1)
    second.put(2)
    third.put(3)
