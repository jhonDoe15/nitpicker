package shop.trash

import jakarta.persistence.Entity
import jakarta.persistence.Id
import java.time.Instant
import org.hibernate.annotations.SQLRestriction

@Entity
class Product(@Id val id: Long, val sku: String, val owner: String, val deletedAt: Instant?)

@Entity
@SQLRestriction("deleted_at is null")
class Invoice(@Id val id: Long, val number: String, val deletedAt: Instant?)

@Entity
class Note(@Id val id: Long, val title: String, val author: String, val archived: Boolean)
