package shop.billing

class LazyAllowed(private val invoices: InvoiceRepository) {
    fun fetchedByGraph(name: String): List<String> = invoices.findByCustomerName(name).map { it.customer.name }

    fun identifiers(): List<Long> = invoices.findAll().map { it.customer.id }

    fun batched(): Int = invoices.findAll().sumOf { it.credits.size }

    fun fromParameter(given: List<Invoice>): Int = given.sumOf { it.lines.size }
}
