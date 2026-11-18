package shop.races

import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Version

@Entity
class Member(@Id val id: Long, val email: String, var name: String?, val team: String)

@Entity
class Seat(@Id val id: Long, @Version val version: Long, var holder: String?)
