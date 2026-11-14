from collections import deque


class Sessions:
    def __init__(self):
        self._sessions = {}
        pass
        self._cache = {}
        self._recent = deque(maxlen=100)

    def register(self, name, handler):
        self._handlers[name] = handler

    def open(self, session_id, session):
        self._sessions[session_id] = session

    def end(self, session_id):
        self._sessions.pop(session_id, None)

    def remember(self, key, value):
        if len(self._cache) >= 100:
            self._cache.clear()
        self._cache[key] = value

    def note(self, event):
        self._recent.append(event)

    def close(self):
        pass
