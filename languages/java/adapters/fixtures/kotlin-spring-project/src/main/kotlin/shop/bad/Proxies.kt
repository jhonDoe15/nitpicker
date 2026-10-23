package shop.bad

import jakarta.persistence.EntityManager
import org.springframework.dao.DataAccessException
import org.springframework.scheduling.annotation.Async
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.io.IOException

@Service
class Billing(private val orders: OrderRepository, private val entityManager: EntityManager) {
    fun charge(id: Long) {
        record(id)
        ::record
    }

    @Transactional
    fun record(id: Long) {
        try {
            orders.deleteById(id)
        } catch (e: DataAccessException) {
            println(e)
        }
        runCatching { orders.flush() }
    }

    @Transactional
    private fun hidden() = Unit

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun audit() = Unit

    @Transactional(readOnly = true)
    fun report(id: Long) {
        orders.save(Order())
        entityManager.persist(Order())
    }

    @Transactional
    @Throws(IOException::class)
    fun export() = Unit

    @Async
    fun notifyLater() = Unit

    @Scheduled(fixedRate = 1000)
    fun tick() = Unit

    companion object {
        @Transactional
        fun statics() = Unit
    }
}

@jakarta.transaction.Transactional
class LegacyTx

@RestController
@Transactional
class TxController {
    @GetMapping("/x")
    fun x(): String = "x"
}

class Mailer {
    @Transactional
    fun send() = Unit
}
