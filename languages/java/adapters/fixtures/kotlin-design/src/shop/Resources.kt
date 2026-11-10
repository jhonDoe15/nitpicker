package shop

class Link(val name: String)

abstract class Depot {
    abstract fun open(name: String): Link

    abstract fun close(link: Link)

    abstract val size: Int

    fun reopen(name: String): Link = open(name)
}

interface Lender {
    fun lend(): Link
}

class Gateway(private val depot: Depot, private val lender: Lender) {
    fun connect(name: String): Link = depot.open(name)

    fun release(link: Link) {
        depot.close(link)
    }

    fun borrow(): Link = lender.lend()

    fun lendTo(other: Gateway): Link = other.lender.lend()

    fun capacity(): Int = depot.size
}

fun openVia(depot: Depot, name: String): Link = depot.open(name)

fun closeVia(depot: Depot, link: Link) {
    depot.close(link)
}

fun lendVia(lender: Lender): Link = lender.lend()

fun capacityOf(depot: Depot): Int = depot.size
