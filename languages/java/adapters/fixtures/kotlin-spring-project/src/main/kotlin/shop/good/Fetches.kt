package shop.good

import jakarta.persistence.EntityManager
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import shop.bad.Invoice

interface InvoiceReads : JpaRepository<Invoice, Long> {
    @Query("select i from Invoice i join fetch i.lines join fetch i.customer join fetch i.receipt")
    fun withLinesAndCustomer(): List<Invoice>

    @EntityGraph(attributePaths = ["lines", "customer"])
    @Query("select i from Invoice i")
    fun graphOfLinesAndCustomer(): List<Invoice>
}

class InvoiceLoads(private val entityManager: EntityManager) {
    fun joined(): List<Invoice> =
        entityManager
            .createQuery("select i from Invoice i join fetch i.tags where i.version > 0", Invoice::class.java)
            .resultList

    fun criteria(): List<Invoice> {
        val query = entityManager.criteriaBuilder.createQuery(Invoice::class.java)
        val invoice = query.from(Invoice::class.java)
        invoice.fetch<Invoice, Any>("lines")
        invoice.fetch<Invoice, Any>("customer")
        return entityManager.createQuery(query).resultList
    }

    fun twoQueries(): Int {
        val first = entityManager.criteriaBuilder.createQuery(Invoice::class.java)
        val withLines = first.from(Invoice::class.java)
        withLines.fetch<Invoice, Any>("lines")
        val second = entityManager.criteriaBuilder.createQuery(Invoice::class.java)
        val withTags = second.from(Invoice::class.java)
        withTags.fetch<Invoice, Any>("tags")
        return entityManager.createQuery(first).resultList.size + entityManager.createQuery(second).resultList.size
    }
}
