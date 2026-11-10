package shop.bad

import jakarta.persistence.EntityManager
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface InvoiceFetches : JpaRepository<Invoice, Long> {
    @Query("select i from Invoice i join fetch i.lines join fetch i.tags")
    fun withLinesAndTags(): List<Invoice>

    @EntityGraph(attributePaths = ["lines", "history"])
    @Query("select i from Invoice i")
    fun graphOfLinesAndHistory(): List<Invoice>
}

class InvoiceCriteria(private val entityManager: EntityManager) {
    fun joined(): List<Invoice> =
        entityManager
            .createQuery("select i from Invoice i join fetch i.lines join fetch i.limits", Invoice::class.java)
            .resultList

    fun criteria(): List<Invoice> {
        val query = entityManager.criteriaBuilder.createQuery(Invoice::class.java)
        val invoice = query.from(Invoice::class.java)
        invoice.fetch<Invoice, Any>("lines")
        invoice.fetch<Invoice, Any>("tags")
        return entityManager.createQuery(query).resultList
    }
}
