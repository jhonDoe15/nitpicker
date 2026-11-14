package shop.reports

import java.math.BigDecimal
import java.nio.file.Path
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import shop.orders.Order
import shop.orders.OrderLoader
import shop.orders.OrderRepository

class AllowedImports(private val repository: OrderRepository, private val loader: OrderLoader) {
    fun batched(ids: List<Long>): List<Order> = repository.findAllById(ids)

    fun paged(): Long {
        var total = 0L
        var number = 0
        while (true) {
            val page = loader.page(number++)
            total += page.numberOfElements
            if (!page.hasNext()) break
        }
        return total
    }

    fun retried(id: Long): BigDecimal? {
        repeat(3) {
            try {
                return loader.price(id)
            } catch (failed: IllegalStateException) {
                println(failed.message)
            }
        }
        return null
    }

    fun chunked(ids: List<Long>) {
        ids.chunked(100).forEach { loader.forget(it) }
    }

    fun files(paths: List<Path>) = paths.map { loader.read(it) }

    fun published(ids: List<Long>) = ids.forEach { loader.placed(it) }

    suspend fun remoteConcurrently(ids: List<Long>) = coroutineScope {
        ids.map { id -> async { loader.price(id) } }.awaitAll()
    }
}
