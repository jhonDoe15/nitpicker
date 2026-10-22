def run(statement, params=()):
    with connect() as connection:
        return connection.execute(statement, params).fetchall()
