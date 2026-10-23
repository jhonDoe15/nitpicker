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

class HeldScopes(
    private val repository: OrderRepository,
    private val loader: OrderLoader,
    private val transactions: TransactionTemplate,
) {
    private val lock = ReentrantLock()
    private val mutex = Mutex()

    @Transactional
    fun confirm(id: Long): BigDecimal? {
        repository.deleteById(id)
        return loader.price(id)
    }

    fun inTemplate(id: Long): BigDecimal? = transactions.execute {
        repository.deleteById(id)
        loader.price(id)
    }

    fun underLock(id: Long): BigDecimal? = lock.withLock { loader.price(id) }

    suspend fun underMutex(id: Long): BigDecimal? = mutex.withLock { loader.price(id) }
}
