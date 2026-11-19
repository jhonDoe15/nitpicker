class Base:
    def parse(self, result, *, partial=False):
        return result


class Child(Base):
    def parse(self, result, *, partial=False):
        if partial:
            result = result.strip()
        return super().parse(result)
