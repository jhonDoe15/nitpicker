package shop.rows

import org.springframework.transaction.annotation.Transactional

class TicketUpdates(private val tickets: TicketRepository) {
    fun expire() {
        val stale = tickets.findByStatus("OPEN")
        stale.forEach { it.status = "EXPIRED" }
        tickets.saveAll(stale)
    }

    @Transactional
    fun close(reason: String) {
        tickets.findByStatus("OPEN").forEach { it.status = reason }
    }

    fun purge() {
        tickets.deleteAll(tickets.findByStatus("OLD"))
    }
}
