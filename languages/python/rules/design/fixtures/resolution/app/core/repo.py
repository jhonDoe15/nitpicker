class Repo:
    def save(self, cart):
        return cart

    def load(self, key):
        return key


class SqlRepo(Repo):
    def save(self, cart):
        return None


class Base:
    def start(self):
        return 1


class Child(Base):
    def start(self):
        return super().start()
