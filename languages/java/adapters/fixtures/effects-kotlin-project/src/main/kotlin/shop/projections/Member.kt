package shop.projections

import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Transient
import org.springframework.data.jpa.repository.JpaRepository

@Entity
class Member(@Id val id: Long, val email: String, val name: String, @Transient val label: String)

interface MemberRepository : JpaRepository<Member, Long> {
    fun findByTeam(team: String): List<Member>

    fun countByEmail(email: String): Long

    fun findByEmail(email: String): Member?
}
