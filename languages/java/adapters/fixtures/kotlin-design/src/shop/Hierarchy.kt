package shop

abstract class Resource {
    fun open() {}

    abstract fun close()
}

class FileRes : Resource() {
    override fun close() {}
}

interface Conn {
    fun open()

    fun close()
}

class Pg : Conn {
    override fun open() {}

    override fun close() {}
}

fun readFile(f: FileRes) {
    f.open()
    try {
        f.hashCode()
    } finally {
        f.close()
    }
}

fun leakFile(f: FileRes) {
    f.open()
}

fun leakPg(pg: Pg) {
    pg.open()
}

fun closePg(pg: Pg) {
    pg.open()
    try {
        pg.hashCode()
    } finally {
        pg.close()
    }
}
