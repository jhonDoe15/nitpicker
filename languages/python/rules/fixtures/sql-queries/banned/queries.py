def find(cursor, user_id, table):
    cursor.execute("SELECT * FROM users WHERE id = " + user_id)
    cursor.execute(f"SELECT * FROM {table}")
    cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)
    cursor.execute("SELECT * FROM users WHERE id = {}".format(user_id))
