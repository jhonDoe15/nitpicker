package shop.bad

import com.github.benmanes.caffeine.cache.Cache
import jakarta.persistence.EntityManager
import java.util.concurrent.ConcurrentHashMap
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.CachePut
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.ListCrudRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate

interface EntryRepository : JpaRepository<Order, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.version = 0 where o.id = :id")
    fun reset(id: Long): Int

    fun deleteByVersion(version: Long): Long

    fun removeAllByVersion(version: Long): List<Order>
}

interface EntryNotes : ListCrudRepository<Order, Long> {
    fun deleteByVersion(version: Long): Long
}

@Service
class EntryService(
    private val entries: EntryRepository,
    private val jdbc: JdbcTemplate,
    private val client: JdbcClient,
    private val entityManager: EntityManager,
) {
    fun move(from: Order, to: Order) {
        entries.save(from)
        entries.save(to)
    }

    fun replace(old: Order, next: Order) {
        entries.save(next)
        forget(old)
    }

    fun settle(id: Long) {
        jdbc.update("update orders set version = 0 where id = ?", id)
        client.sql("delete from order_audit where order_id = :id").param("id", id).update()
    }

    fun purge(id: Long) {
        entityManager.createQuery("delete from Order o where o.id = :id").setParameter("id", id).executeUpdate()
        entries.deleteById(id)
    }

    private fun forget(order: Order) {
        entries.delete(order)
    }
}

@Service
@Transactional
class EntryCache(
    private val entries: EntryRepository,
    private val caches: CacheManager,
    private val recent: Cache<String, Order>,
) {
    private val byName = ConcurrentHashMap<String, Order>()

    fun reprice(name: String, order: Order) {
        entries.save(order)
        caches.getCache("prices")?.put(name, order)
        caches.getCache("prices")?.evict(name)
    }

    fun remember(name: String, order: Order) {
        recent.put(name, entries.save(order))
        recent.asMap().remove(name)
        byName[name] = entries.save(order)
        val saved = entries.save(order)
        byName.putIfAbsent(name, saved)
        byName.getOrPut(name) { entries.save(order) }
        note(name)
    }

    @CachePut("prices")
    fun refresh(order: Order): Order = entries.save(order)

    private fun note(name: String) {
        recent.invalidate(name)
    }
}

@Component
class EntryJobs(
    private val entries: EntryRepository,
    private val recent: Cache<String, Order>,
    private val transactions: TransactionTemplate,
) {
    fun run(name: String, order: Order) {
        transactions.executeWithoutResult {
            entries.save(order)
            recent.invalidate(name)
        }
        recent.put(name, order)
    }
}
