package shop.rows

class TicketUpdatesAllowed(private val tickets: TicketRepository, private val receipts: ReceiptRepository) {
    fun fromElement() {
        val open = tickets.findByStatus("OPEN")
        open.forEach { it.status = it.status + "-seen" }
        tickets.saveAll(open)
    }

    fun versioned() {
        val open = receipts.findByStatus("OPEN")
        open.forEach { it.status = "PAID" }
        receipts.saveAll(open)
    }

    fun usedAfterwards(): Int {
        val open = tickets.findByStatus("OPEN")
        open.forEach { it.status = "EXPIRED" }
        tickets.saveAll(open)
        return open.size
    }

    fun notWritten() {
        tickets.findByStatus("OPEN").forEach { it.status = "EXPIRED" }
    }
}
