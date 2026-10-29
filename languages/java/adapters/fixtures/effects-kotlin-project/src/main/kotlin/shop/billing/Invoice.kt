package shop.billing

import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.ManyToOne
import jakarta.persistence.OneToMany
import org.hibernate.annotations.BatchSize

@Entity
class Invoice(
    @Id val id: Long,
    @ManyToOne(fetch = FetchType.LAZY) val customer: Customer,
    @OneToMany(mappedBy = "invoice") val lines: List<InvoiceLine>,
    @OneToMany(mappedBy = "invoice") @BatchSize(size = 50) val credits: List<InvoiceLine>,
)

@Entity
class Customer(@Id val id: Long, val name: String)

@Entity
class InvoiceLine(@Id val id: Long, @ManyToOne(fetch = FetchType.LAZY) val invoice: Invoice)
