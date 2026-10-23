package shop.billing

import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface InvoiceRepository : JpaRepository<Invoice, Long> {
    @Query("select i from Invoice i where i.id > :from")
    fun findFrom(from: Long): List<Invoice>

    @EntityGraph(attributePaths = ["customer"])
    fun findByCustomerName(name: String): List<Invoice>
}
