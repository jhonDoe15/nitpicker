import re

LDAP_SHAPE = re.compile(r"\(\s*[&|!(]|\(\s*[\w.;-]+\s*(?:~|>|<)?=")
LDAP_VALUE = re.compile(r"=\*?$")
SCIM_CLAUSE = r"(?:^|[\s(])[A-Za-z][\w.:\[\]]*\s+(?:eq|ne|co|sw|ew|gt|ge|lt|le)\s+"
SCIM_SHAPE = re.compile(SCIM_CLAUSE)
SCIM_VALUE = re.compile(SCIM_CLAUSE + r"\"?$")


def is_ldap_value(before):
    return LDAP_VALUE.search(before) is not None


def is_scim_value(before):
    return SCIM_VALUE.search(before) is not None


def has_ldap_shape(text):
    return LDAP_SHAPE.search(text) is not None


def has_scim_shape(text):
    return SCIM_SHAPE.search(text) is not None
