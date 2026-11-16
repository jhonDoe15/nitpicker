package shop.rows

import org.springframework.data.jpa.repository.JpaRepository

interface TicketRepository : JpaRepository<Ticket, Long> {
    fun findByStatus(status: String): List<Ticket>
}

interface ReceiptRepository : JpaRepository<Receipt, Long> {
    fun findByStatus(status: String): List<Receipt>
}
