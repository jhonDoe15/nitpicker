package shop.billing

class LazyLoads(private val invoices: InvoiceRepository) {
    fun customerNames(): List<String> = invoices.findAll().map { it.customer.name }

    fun lineCount(): Int {
        var count = 0
        for (invoice in invoices.findFrom(10)) {
            count += invoice.lines.size
        }
        return count
    }

    fun lazySequence(): Int = invoices.findAll().asSequence().map { it.lines.size }.sum()
}
