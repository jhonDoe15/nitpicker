def find(cursor, user_id):
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
