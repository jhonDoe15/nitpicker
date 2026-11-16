package shop.rows

import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Transient
import jakarta.persistence.Version
import java.time.Instant
import org.springframework.data.domain.Limit
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.reactive.ReactiveCrudRepository
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono

enum class ReceiptState { OPEN, PAID }

@Entity
class Receipt(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long? = null,
    @Version var version: Long = 0,
    var customer: String = "",
    var amount: Long = 0,
    var issuedAt: Instant = Instant.EPOCH,
    @Enumerated(EnumType.STRING) var state: ReceiptState = ReceiptState.OPEN,
) {
    @Transient
    var reminders: Long = 0

    val large: Boolean
        get() = amount > 100
}

interface ReceiptRepository : JpaRepository<Receipt, Long> {
    @Query("select r from Receipt r where r.customer = :customer")
    fun forCustomer(customer: String): List<Receipt>

    @Query("select r from Receipt r where r.customer = :customer")
    fun pageFor(customer: String, page: Pageable): Page<Receipt>

    @Query("select r from Receipt r order by r.amount desc")
    fun largest(limit: Limit): List<Receipt>

    @Query("select count(r) from Receipt r where r.customer = :customer")
    fun countFor(customer: String): Long
}

interface ReactiveReceipts : ReactiveCrudRepository<Receipt, Long> {
    @Query("select r from Receipt r where r.customer = :customer")
    fun forCustomer(customer: String): Flux<Receipt>
}

fun interface ReceiptPolicy {
    fun allows(receipt: Receipt): Boolean
}

@Service
class ReceiptReports(private val receipts: ReceiptRepository, private val reactive: ReactiveReceipts) {
    fun count(customer: String): Int = receipts.forCustomer(customer).size

    fun none(customer: String): Boolean = receipts.forCustomer(customer).isEmpty()

    fun counted(customer: String): Int = receipts.forCustomer(customer).count()

    fun total(customer: String): Long = receipts.forCustomer(customer).sumOf { it.amount }

    fun largest(customer: String): Long = receipts.forCustomer(customer).maxOf { receipt -> receipt.amount }

    fun perState(customer: String): Map<ReceiptState, Int> =
        receipts.forCustomer(customer).groupingBy { it.state }.eachCount()

    fun sorted(customer: String): List<Receipt> = receipts.forCustomer(customer).sortedBy { it.issuedAt }

    fun byReference(customer: String): List<Receipt> = receipts.forCustomer(customer).sortedBy(Receipt::issuedAt)

    fun ordered(customer: String): List<Receipt> =
        receipts.forCustomer(customer).sortedWith(compareBy({ it.state }, { it.issuedAt }))

    fun large(customer: String, floor: Long): List<Receipt> =
        receipts.forCustomer(customer).filter { it.amount > floor }

    fun anyOpen(customer: String): Boolean = receipts.forCustomer(customer).any { it.state == ReceiptState.OPEN }

    fun named(ids: List<Long>, customer: String): Receipt =
        receipts.findAllById(ids).first { it.customer == customer }

    fun paged(customer: String, page: Pageable): List<Receipt> =
        receipts.pageFor(customer, page).content.filter { it.amount > 0 }

    fun reactiveCount(customer: String): Mono<Long> = reactive.forCustomer(customer).count()

    fun reactiveOpen(customer: String): Flux<Receipt> =
        reactive.forCustomer(customer).filter { it.state == ReceiptState.OPEN }
}

@Service
class ReceiptViews(private val receipts: ReceiptRepository, private val policy: ReceiptPolicy) {
    fun counted(customer: String): Long = receipts.countFor(customer)

    fun names(customer: String): List<String> = receipts.forCustomer(customer).map { it.customer }

    fun allowed(customer: String): List<Receipt> = receipts.forCustomer(customer).filter { policy.allows(it) }

    fun computed(customer: String): List<Receipt> = receipts.forCustomer(customer).filter { it.large }

    fun transient(customer: String): Long = receipts.forCustomer(customer).sumOf { it.reminders }

    fun limited(customer: String): List<Receipt> = receipts.forCustomer(customer).filter { it.amount > floor() }

    fun pageSize(customer: String, page: Pageable): Int = receipts.pageFor(customer, page).content.size

    fun topByDate(limit: Limit): List<Receipt> = receipts.largest(limit).sortedBy { it.issuedAt }

    fun held(customer: String): List<Receipt> {
        val rows = receipts.forCustomer(customer)
        return if (rows.isEmpty()) emptyList() else rows
    }

    private fun floor(): Long = 10
}
