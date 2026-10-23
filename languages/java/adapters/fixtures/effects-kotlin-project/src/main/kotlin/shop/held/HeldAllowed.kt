package shop.held

import java.math.BigDecimal
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
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
    private var count = 0

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
}
