package shop.reports

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.springframework.data.repository.findByIdOrNull
import shop.orders.Order
import shop.orders.OrderLoader
import shop.orders.OrderRepository

class LoopImports(private val repository: OrderRepository, private val loader: OrderLoader) {
    fun direct(ids: List<Long>) {
        for (id in ids) {
            repository.deleteById(id)
        }
    }

    fun inlined(ids: List<Long>): List<Order?> = ids.map { repository.findByIdOrNull(it) }

    fun throughHelper(ids: List<Long>) {
        ids.forEach { loader.load(it) }
    }

    fun remote(ids: List<Long>) = ids.map { loader.price(it) }

    suspend fun concurrent(ids: List<Long>) = coroutineScope {
        ids.map { id -> async { loader.load(id) } }.awaitAll()
    }
}
