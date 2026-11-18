package shop.rows

import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Version

@Entity
class Ticket(@Id val id: Long, var status: String)

@Entity
class Receipt(@Id val id: Long, @Version var version: Long, var status: String)
