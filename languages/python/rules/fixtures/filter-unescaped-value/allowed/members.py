import ldap3
from ldap3.utils.conv import escape_filter_chars


def group_members(connection, base_dn, member_attr, group_dn):
    search_filter = f"({member_attr}={escape_filter_chars(group_dn)})"
    connection.search(base_dn, search_filter)
