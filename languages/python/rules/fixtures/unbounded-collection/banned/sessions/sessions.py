class Sessions:
    def __init__(self):
        self._sessions = {}
        self._seen = set()

    def open(self, session_id, session):
        self._sessions[session_id] = session

    def seen(self, token):
        self._seen.add(token)

    def close(self):
        pass
