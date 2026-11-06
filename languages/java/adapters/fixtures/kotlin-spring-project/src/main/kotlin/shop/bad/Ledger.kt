package shop.bad

import com.github.benmanes.caffeine.cache.Cache
import jakarta.persistence.EntityManager
import java.util.concurrent.ConcurrentHashMap
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.CacheEvict
import org.springframework.cache.annotation.CachePut
import org.springframework.cache.annotation.Caching
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.ListCrudRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
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
    private val named: NamedParameterJdbcTemplate,
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

    fun tidy(order: Order, audit: Order) {
        try {
            entries.save(order)
        } finally {
            entries.save(audit)
        }
    }

    fun forgetBoth(first: Order, second: Order) {
        forget(first)
        forget(second)
    }

    fun expire(id: Long) {
        named.update("delete from order_audit where order_id = :id", mapOf("id" to id))
        jdbc.batchUpdate("update orders set version = 0")
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
    private val codes = ConcurrentHashMap<String, Int>()

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
        codes[name] = saved.hashCode()
        recent.putAll(mapOf(name to order))
        recent.invalidateAll()
        caches.getCache("names")?.let { it.evict(name) }
        note(name)
    }

    @CachePut("prices")
    fun refresh(order: Order): Order = entries.save(order)

    @Caching(put = [CachePut("prices")], evict = [CacheEvict("names")])
    fun rename(order: Order): Order = entries.save(order)

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
