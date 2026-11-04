class Session:
    def begin(self):
        return self

    def write(self, row):
        return row

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


class Managed(Session):
    def __enter__(self):
        self.begin()
        return self

    def __exit__(self, kind, error, trace):
        self.commit()
        self.close()
        return False


class AsyncManaged(Session):
    async def __aenter__(self):
        return self

    async def __aexit__(self, kind, error, trace):
        await self.close()


class Conditional(Session):
    def __enter__(self):
        return self

    def __exit__(self, kind, error, trace):
        if error is not None:
            self.rollback()
        self.close()


class Opaque:
    def __enter__(self):
        return object()

    def __exit__(self, kind, error, trace):
        return False


class Resource:
    def close(self):
        return None
