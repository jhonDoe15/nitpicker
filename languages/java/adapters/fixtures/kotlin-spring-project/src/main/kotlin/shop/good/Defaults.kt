package shop.good

import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.cache.annotation.Cacheable
import org.springframework.context.ApplicationContextInitializer
import org.springframework.context.support.GenericApplicationContext
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.ResponseEntity
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.util.concurrent.CompletableFuture

class Conflict(cause: Throwable) : RuntimeException(cause)

@Service
class Accounts(private val orders: OrderRepository) {
    @Transactional
    fun duplicate(order: Order) {
        try {
            orders.save(order)
        } catch (e: DataIntegrityViolationException) {
            error("duplicate order: ${e.mostSpecificCause}")
        }
    }

    @Transactional
    fun helper(order: Order) {
        try {
            orders.save(order)
        } catch (e: Exception) {
            fail(e)
        }
    }

    private fun fail(e: Exception): Nothing = throw Conflict(e)

    @Transactional
    fun onFailure(order: Order) {
        runCatching { orders.save(order) }.onFailure { throw Conflict(it) }
    }

    @Transactional
    fun folded(order: Order): Order = runCatching { orders.save(order) }.fold({ it }, { throw Conflict(it) })

    @Transactional
    fun orElse(order: Order): Order = runCatching { orders.save(order) }.getOrElse { throw Conflict(it) }

    @Transactional
    fun later(order: Order) {
        val result = runCatching { orders.save(order) }
        result.getOrThrow()
    }

    @Async("mailExecutor")
    fun sendLater(id: Long) = CompletableFuture.completedFuture(id)
}

@Service
class Catalog(private val other: Inventory) {
    private val items = mutableListOf<String>()

    @Cacheable("catalog")
    fun cached(id: Long): String = id.toString()

    @Transactional
    fun list(): List<String> = items.toList()

    fun lookup(ids: List<Long>) = ids.map { other.run { cached(it) } }

    fun all() = with(other) { list() }

    fun build(input: List<String>): List<String> {
        val items = mutableListOf<String>()
        input.forEach { items.add(it) }
        return items
    }
}

@Service
class Inventory {
    @Cacheable("inventory")
    fun cached(id: Long): String = id.toString()

    @Transactional
    fun list(): List<String> = emptyList()
}

@Component
class SingletonsReady(private val orders: OrderRepository) : SmartInitializingSingleton {
    override fun afterSingletonsInstantiated() {
        orders.count()
    }
}

class BeansInitializer : ApplicationContextInitializer<GenericApplicationContext> {
    override fun initialize(context: GenericApplicationContext) {
        context.registerBean(Inventory::class.java, { Inventory() })
    }
}

@RestController
class InferredViews {
    @GetMapping("/view")
    fun view() = OrderView(1)

    @GetMapping("/wrapped")
    fun wrapped() = ResponseEntity.ok(OrderView(1))
}

@Component
annotation class DomainService

@DomainService
class Pricing {
    @Transactional
    fun quote() = 1
}

@Validated
class Checks {
    @Transactional
    fun run() = Unit
}
