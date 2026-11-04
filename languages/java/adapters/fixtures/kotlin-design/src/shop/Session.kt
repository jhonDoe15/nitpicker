package shop

class Session {
    fun begin() {}

    fun write(data: String) {}

    fun commit() {}

    fun close() {}
}

class Pool {
    val session = Session()

    fun open(): Session = Session()
}

fun balanced(session: Session) {
    session.begin()
    try {
        session.write("x")
    } finally {
        session.close()
    }
}

fun unbalanced(session: Session) {
    session.begin()
    session.write("x")
    session.close()
}

fun inCatch(session: Session) {
    try {
        session.write("x")
    } catch (e: IllegalStateException) {
        session.close()
    }
}

fun usesLambda() {
    Session().use { it.write("x") }
}

fun usesVariable(pool: Pool) {
    val mine = pool.open()
    mine.use { it.begin() }
    pool.session.use { it.commit() }
}

fun aliased(pool: Pool) {
    val a = pool.open()
    val b = a
    a.begin()
    b.commit()
}

fun reassigned(pool: Pool) {
    var s = pool.open()
    s.begin()
    s = pool.open()
    s.commit()
}
