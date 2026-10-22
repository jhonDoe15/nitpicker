import logging.config


def configure(settings: dict[str, object]) -> None:
    logging.config.dictConfig(settings)
