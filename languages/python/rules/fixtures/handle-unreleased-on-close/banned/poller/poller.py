import signal
import threading


class Poller:
    def __init__(self, loop):
        self._loop = loop
        self._handle = None
        self._timer = None

    def start(self):
        self._handle = self._loop.call_later(5, self.tick)
        self._loop.add_signal_handler(signal.SIGTERM, self.close)
        self._timer = threading.Timer(30, self.tick)

    def tick(self):
        pass

    def close(self):
        self._timer = None
