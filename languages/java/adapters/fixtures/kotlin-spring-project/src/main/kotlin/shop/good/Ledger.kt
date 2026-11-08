package shop.good

import com.github.benmanes.caffeine.cache.Cache
import java.util.concurrent.ConcurrentHashMap
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.CacheEvict
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.reactive.ReactiveCrudRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.reactive.TransactionalOperator
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import reactor.core.publisher.Mono

interface EntryRepository : JpaRepository<Shipment, Long> {
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Shipment s set s.status = :status where s.id = :id")
    fun reset(id: Long, status: Status): Int

    @Query("select s from Shipment s where s.status = :status")
    fun deleteCandidates(status: Status): List<Shipment>

    override fun deleteById(id: Long)

    @Query("select s from Shipment s where s.id > :id")
    fun updatedSince(id: Long): List<Shipment>
}

@Transactional
abstract class EntryBase

@Service
class InheritedEntries(private val entries: EntryRepository) : EntryBase() {
    fun move(from: Shipment, to: Shipment) {
        entries.save(from)
        entries.save(to)
    }
}

@Service
class EntryService(
    private val entries: EntryRepository,
    private val reactive: ReactiveCrudRepository<Shipment, Long>,
    private val operator: TransactionalOperator,
    private val transactions: TransactionTemplate,
) {
    fun either(shipment: Shipment, keep: Boolean) {
        if (keep) {
            entries.save(shipment)
        } else {
            entries.delete(shipment)
        }
    }

    fun picked(shipment: Shipment, status: Status) {
        when (status) {
            Status.PAID -> entries.save(shipment)
            else -> entries.delete(shipment)
        }
    }

    fun attempt(shipment: Shipment, failure: Shipment) {
        try {
            entries.save(shipment)
        } catch (e: IllegalStateException) {
            entries.save(failure)
        }
    }

    fun guard(shipment: Shipment, skip: Boolean) {
        if (skip) {
            entries.save(shipment)
            return
        }
        entries.delete(shipment)
    }

    fun check(shipment: Shipment, failure: Shipment, broken: Boolean) {
        if (broken) {
            entries.save(failure)
            throw IllegalStateException("broken")
        }
        entries.save(shipment)
    }

    fun choose(first: Shipment, second: Shipment, early: Boolean): Shipment =
        if (early) entries.save(first) else entries.save(second)

    fun branch(shipment: Shipment, keep: Boolean) {
        if (keep) {
            entries.save(shipment)
        } else {
            forget(shipment)
        }
    }

    fun recent(id: Long): List<Shipment> {
        entries.updatedSince(id)
        return entries.updatedSince(id + 1)
    }

    private fun forget(shipment: Shipment) {
        entries.delete(shipment)
    }

    fun once(items: List<Shipment>) {
        entries.saveAll(items)
    }

    @Transactional
    fun move(from: Shipment, to: Shipment) {
        entries.save(from)
        entries.save(to)
    }

    fun moveInTemplate(from: Shipment, to: Shipment) {
        transactions.executeWithoutResult {
            entries.save(from)
            entries.save(to)
        }
    }

    fun moveReactive(from: Shipment, to: Shipment): Mono<Shipment> =
        operator.transactional(reactive.save(from).then(reactive.save(to)))
}

@Service
@Transactional
class EntryCache(
    private val entries: EntryRepository,
    private val caches: CacheManager,
    private val recent: Cache<String, Shipment>,
) {
    private val labels = ConcurrentHashMap<String, Shipment>()

    fun later(name: String, shipment: Shipment) {
        entries.save(shipment)
        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() {
                    caches.getCache("prices")?.put(name, shipment)
                    recent.put(name, shipment)
                }
            },
        )
        afterCommit { recent.invalidate(name) }
    }

    fun label(name: String, shipment: Shipment) {
        labels[name] = shipment
    }

    @CacheEvict(value = ["prices"], beforeInvocation = true)
    fun drop(shipment: Shipment) {
        entries.delete(shipment)
    }

    @Transactional(readOnly = true)
    fun warm(name: String): Shipment {
        val found = entries.findById(1L).orElseThrow()
        caches.getCache("prices")?.put(name, found)
        return found
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    fun peek(name: String, shipment: Shipment): Shipment {
        caches.getCache("prices")?.put(name, shipment)
        return shipment
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    fun outside(name: String, shipment: Shipment) {
        recent.put(name, entries.save(shipment))
    }

    companion object {
        fun prime(cache: Cache<String, Shipment>, shipment: Shipment) {
            cache.put("first", shipment)
        }
    }

    private fun afterCommit(action: () -> Unit) {
        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() = action()
            },
        )
    }
}
