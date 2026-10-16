package demo

import jakarta.persistence.EntityManager
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Service

class Order

interface OrderRepo : JpaRepository<Order, Long> {
    fun findByName(name: String): List<Order> // violation: SpringDataDerivedQuery

    fun findAlways(id: Long): Order? = null

    @Query("select o from Order o where o.name = :name")
    fun named(name: String): List<Order>

    @Query("select o from Order o where o.id = ?1") // violation: SpringDataNamedParameters
    fun positional(id: Long): Order?

    @Query(value = "select * from orders", nativeQuery = true) // violation: SpringDataNativeQuery
    fun nativeOne(): List<Order>

    @Suppress("PMD.SpringDataNativeQuery")
    @Query(value = "select 1", nativeQuery = true)
    fun allowedNative(): Int

    @Query("select o " + "from Order o") // violation: SpringDataQueryTextBlock
    fun joined(): List<Order>

    @Query("""
        select o
        from Order o
    """)
    fun block(): List<Order>

    @Modifying // violation: SpringDataModifyingQuery
    @Query("delete from Order")
    fun wipe()

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Order o where o.id = :id")
    fun wipeOne(id: Long)
}

interface ExtendedRepo : OrderRepo {
    fun findByOwner(owner: String): List<Order> // violation: SpringDataDerivedQuery
}

@Service
class Batches(private val repo: OrderRepo, private val entities: EntityManager) {
    fun loop(orders: List<Order>) {
        for (order in orders) { repo.save(order) } // violation: SpringDataNoSaveInLoop
        orders.forEach { repo.delete(it) } // violation: SpringDataNoSaveInLoop
        orders.forEach(repo::delete) // violation: SpringDataNoSaveInLoop
        orders.map { entities.persist(it) } // violation: SpringDataNoSaveInLoop
        repo.saveAll(orders)
        for (order in orders) { entities.persist(order); entities.flush(); entities.clear() }
        repo.findById(1L).map { repo.save(it) }
    }

    fun flushing() {
        repo.flush() // violation: SpringDataNoFlush
        entities.flush() // violation: SpringDataNoFlush
        repo.saveAndFlush(Order()) // violation: SpringDataNoFlush
    }
}
