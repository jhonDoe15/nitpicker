package shop.good

import org.springframework.dao.DuplicateKeyException
import org.springframework.scheduling.annotation.Async
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.IOException
import java.util.concurrent.CompletableFuture

@Service
class Billing(private val orders: OrderRepository, private val audit: Audit) {
    @Transactional
    fun charge(id: Long) {
        record(id)
        audit.write(id)
        try {
            orders.deleteById(id)
        } catch (e: DuplicateKeyException) {
            throw IllegalStateException("duplicate", e)
        }
        runCatching { orders.count() }.getOrThrow()
    }

    @Transactional
    fun record(id: Long) {
        orders.deleteById(id)
    }

    @Transactional(readOnly = true)
    fun report(): Long = orders.count()

    @Transactional(rollbackFor = [Exception::class])
    @Throws(IOException::class)
    fun export() = Unit

    @Async("mailExecutor")
    fun notifyLater(): CompletableFuture<Unit> = CompletableFuture.completedFuture(Unit)

    @Scheduled(fixedDelay = 1000)
    fun tick() = Unit
}

@Service
class Audit {
    @Transactional
    fun write(id: Long) = id
}

interface Gateway {
    @Transactional
    fun send()
}
