def load(cursor, schema):
    cursor.execute("SELECT * FROM tables WHERE schema = %s", (schema.name))
