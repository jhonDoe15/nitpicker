package shop.held

import java.math.BigDecimal
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import shop.orders.OrderLoader
import shop.orders.OrderRepository

class HeldAllowed(
    private val repository: OrderRepository,
    private val loader: OrderLoader,
    private val transactions: TransactionTemplate,
) {
    private val lock = ReentrantLock()
    private val mutex = Mutex()
    private var count = 0
    private var cached: BigDecimal? = null

    @Transactional
    fun remoteOnly(id: Long): BigDecimal? = loader.price(id)

    fun before(id: Long): BigDecimal? {
        val price = loader.price(id)
        transactions.executeWithoutResult { repository.deleteById(id) }
        return price
    }

    fun afterUnlock(id: Long): BigDecimal? {
        lock.withLock { count++ }
        return loader.price(id)
    }

    fun cachedUnderLock(id: Long): BigDecimal? = lock.withLock {
        cached?.let { return it }
        cached = loader.price(id)
        cached
    }

    fun cachedSynchronized(id: Long): BigDecimal? = synchronized(this) {
        if (cached == null) cached = loader.price(id)
        cached
    }

    suspend fun cachedUnderMutex(id: Long): BigDecimal? = mutex.withLock {
        if (cached != null) return cached
        cached = loader.price(id)
        cached
    }
}
