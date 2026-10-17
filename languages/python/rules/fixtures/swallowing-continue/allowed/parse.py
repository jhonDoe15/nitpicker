import logging

logger = logging.getLogger(__name__)


def parse_all(texts: list[str]) -> list[int]:
    numbers = []
    for text in texts:
        try:
            numbers.append(int(text))
        except ValueError:
            logger.exception("not a number: %s", text)
            continue
    return numbers
