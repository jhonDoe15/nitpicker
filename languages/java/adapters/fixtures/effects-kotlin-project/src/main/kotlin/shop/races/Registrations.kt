package shop.races

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

private const val LIMIT = 10L

@Service
class Registrations(private val members: MemberRepository, private val seats: SeatRepository) {
    fun register(email: String, team: String) {
        if (members.existsByEmail(email)) {
            throw IllegalStateException("taken")
        }
        members.save(Member(1L, email, null, team))
    }

    @Transactional
    fun join(team: String, email: String) {
        if (members.countByTeam(team) >= LIMIT) {
            throw IllegalStateException("full")
        }
        members.save(Member(1L, email, null, team))
    }

    fun findOrCreate(email: String, team: String): Member =
        members.findByEmail(email) ?: members.save(Member(1L, email, null, team))

    fun rename(id: Long, name: String) {
        val member = members.findByIdOrNull(id) ?: throw IllegalArgumentException("missing")
        if (member.name == null) {
            return
        }
        member.name = name
        members.save(member)
    }

    @Transactional
    fun renameLocked(id: Long, name: String) {
        val member = members.lockById(id) ?: throw IllegalArgumentException("missing")
        if (member.name == null) {
            return
        }
        member.name = name
        members.save(member)
    }

    @Transactional(isolation = Isolation.SERIALIZABLE)
    fun registerSerializable(email: String, team: String) {
        if (members.existsByEmail(email)) {
            throw IllegalStateException("taken")
        }
        members.save(Member(1L, email, null, team))
    }

    fun takeSeat(id: Long, holder: String) {
        val seat = seats.findByIdOrNull(id) ?: throw IllegalArgumentException("missing")
        if (seat.holder != null) {
            throw IllegalStateException("taken")
        }
        seat.holder = holder
        seats.save(seat)
    }

    fun renameFound(id: Long, name: String) {
        val member = members.findByIdOrNull(id) ?: throw IllegalArgumentException("missing")
        member.name = name
        members.save(member)
    }

    fun registerOther(email: String, team: String) {
        if (seats.existsById(1L)) {
            throw IllegalStateException("taken")
        }
        members.save(Member(1L, email, null, team))
    }
}
