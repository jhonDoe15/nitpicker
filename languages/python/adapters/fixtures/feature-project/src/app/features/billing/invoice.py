from app.features.shipping import api


class Invoice:
    def label(self) -> str:
        return api.ship()
