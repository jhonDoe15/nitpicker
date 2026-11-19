import ldap3


def group_members(connection, base_dn, member_attr, group_dn):
    search_filter = f"({member_attr}={group_dn})"
    connection.search(base_dn, search_filter)
