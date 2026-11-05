import re

from checks.common import words_of
from credentials.spec import (
    CREDENTIAL_SHAPES,
    EMBEDDED_SECRET_PATTERNS,
    IDENTIFIER_PATTERNS,
    MARKER_TOKEN_WORDS,
    NOT_SECRET_PATTERNS,
    PASSPHRASE_LENGTH,
    PASSPHRASE_NAME_WORDS,
    PLACEHOLDER_PATTERNS,
    SECRET_CHARACTER_CLASSES,
    SECRET_NAME_WORDS,
    SECRET_VALUE_LENGTH,
    SECRET_VALUE_SUFFIXES,
)


def any_of(patterns):
    return "(?:" + "|".join(patterns) + ")"


SECRET_NAME = re.compile(any_of(SECRET_NAME_WORDS) + "$")
SECRET_WORD = re.compile(any_of(SECRET_NAME_WORDS))
PASSPHRASE_NAME = re.compile(any_of(PASSPHRASE_NAME_WORDS) + "$")
PLACEHOLDER = re.compile(any_of(PLACEHOLDER_PATTERNS), re.IGNORECASE | re.ASCII)
NOT_SECRET = re.compile(any_of(NOT_SECRET_PATTERNS), re.ASCII)
IDENTIFIER = re.compile(any_of(IDENTIFIER_PATTERNS), re.ASCII)
CREDENTIALS = [re.compile(shape, re.ASCII) for shape in CREDENTIAL_SHAPES]
EMBEDDED = [
    re.compile(shape, re.IGNORECASE | re.ASCII) for shape in EMBEDDED_SECRET_PATTERNS
]
URL_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://", re.IGNORECASE)
CHARACTER_CLASSES = [
    re.compile(pattern) for pattern in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]")
]


def name_words(name):
    words = words_of(name)
    kept = len(words)
    for word in reversed(words):
        if word not in SECRET_VALUE_SUFFIXES:
            break
        kept -= 1
    return words[: max(1, kept)]


def joined_letters(words):
    return re.sub(r"\d", "", "".join(words))


def is_secret_name(name):
    words = name_words(name)
    marker = len(words) > 1 and words[-1] == "token" and words[-2] in MARKER_TOKEN_WORDS
    return not marker and bool(SECRET_NAME.search(joined_letters(words)))


def is_candidate(text):
    return not (
        re.search(r"\s", text)
        or PLACEHOLDER.fullmatch(text)
        or NOT_SECRET.fullmatch(text)
    )


def looks_like_secret_value(text):
    if len(text) < SECRET_VALUE_LENGTH or not is_candidate(text):
        return False
    classes = sum(1 for pattern in CHARACTER_CLASSES if pattern.search(text))
    mixed = re.search(r"\d", text) and re.search(r"[A-Za-z]", text)
    return bool(mixed) or classes >= SECRET_CHARACTER_CLASSES


def has_credential_shape(text):
    if any(shape.search(text) for shape in CREDENTIALS):
        return True
    for shape in EMBEDDED:
        match = shape.search(text)
        if match and looks_like_secret_value(match.group(1)):
            return True
    return False


def is_passphrase(text, name):
    long = len(text) >= PASSPHRASE_LENGTH and re.search(r"[a-z][A-Z]", text)
    named = PASSPHRASE_NAME.search(joined_letters(name_words(name)))
    return bool(long and named and is_candidate(text))


def names_a_secret(text, name):
    words = words_of(text)
    named = IDENTIFIER.fullmatch(text) and SECRET_WORD.search(joined_letters(words))
    return bool(named) or "".join(words) == "".join(words_of(name))


def is_hardcoded_secret(text, name):
    if (
        has_credential_shape(text)
        or URL_SCHEME.match(text)
        or names_a_secret(text, name)
    ):
        return False
    return looks_like_secret_value(text) or is_passphrase(text, name)
