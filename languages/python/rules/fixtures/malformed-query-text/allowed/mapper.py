def search(cursor, group_id):
    where = "SELECT * FROM config_info WHERE tenant = %s"
    if group_id:
        where += " AND group_id LIKE %s"
    cursor.execute(where)
