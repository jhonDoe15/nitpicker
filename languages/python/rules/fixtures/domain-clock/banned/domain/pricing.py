import time
from datetime import datetime


def stamp():
    return datetime.now(), time.time()
