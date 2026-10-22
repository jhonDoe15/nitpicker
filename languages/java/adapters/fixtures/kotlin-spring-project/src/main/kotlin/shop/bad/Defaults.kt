package shop.bad

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.cache.annotation.Cacheable
import org.springframework.context.ApplicationContext
import org.springframework.core.env.Environment
import org.springframework.core.env.get
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.IOException

annotation class AggregateRoot

@ConfigurationProperties("jwt")
data class JwtProps(val secret: String = "dev-secret", val algorithm: String = "HS256")

@Service
class Receipts(
    private val orders: OrderRepository,
    private val environment: Environment,
    private val context: ApplicationContext,
) {
    fun issue(order: Order) {
        record(order)
        find(1L, 2L)
    }

    @Transactional
    fun record(order: Order, notify: Boolean = false) {
        orders.save(order)
        if (notify) println(order)
    }

    @Cacheable("receipts")
    fun find(vararg ids: Long): List<Order> = ids.map { Order() }

    @Transactional
    fun retry(order: Order) {
        try {
            orders.save(order)
        } catch (e: ObjectOptimisticLockingFailureException) {
            println(e)
        }
    }

    @Transactional
    fun importAll(path: String) {
        if (path.isEmpty()) throw IOException("missing")
    }

    @Transactional
    fun settle(id: Long) {
        cancel(id)
    }

    private fun cancel(id: Long, quietly: Boolean = true) {
        try {
            orders.deleteById(id)
        } catch (e: Exception) {
            if (!quietly) println(e)
        }
    }

    fun secret(): String = environment.getProperty("jwt.secret") ?: "dev-secret"

    fun url(): String? = environment["app.url"]

    fun mode(): String? = context.environment.getProperty("app.mode")

    fun fetch(): String? = org.springframework.web.client.RestTemplate().getForObject("/x", String::class.java)
}

@Service
class Sequence {
    fun next(key: String): Int {
        instances += 1
        seen[key] = 1
        return instances
    }

    companion object {
        private var instances = 0
        private val seen = HashMap<String, Int>()
    }
}

@Service
class Caches {
    private val first = HashMap<String, String>()
    private val second = HashMap<String, String>()
    private val third = mutableListOf<String>()

    fun remember(key: String) {
        first.apply { put(key, key) }
        with(second) { put(key, key) }
        third.also { it.add(key) }
    }
}

@Service
class SecondaryInjected {
    private val orders: OrderRepository

    @Autowired
    constructor(orders: OrderRepository) {
        this.orders = orders
    }

    fun count() = orders.count()
}

@AggregateRoot
class Invoicing {
    @Transactional
    fun charge() = Unit
}
