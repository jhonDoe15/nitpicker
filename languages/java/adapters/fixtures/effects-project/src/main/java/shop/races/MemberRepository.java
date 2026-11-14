package shop.races;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface MemberRepository extends JpaRepository<Member, Long> {
  boolean existsByEmail(String email);

  long countByTeam(String team);

  Optional<Member> findByEmail(String email);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select m from Member m where m.id = :id")
  Optional<Member> lockById(Long id);

  @Query("select m from Member m where m.email = :email for update")
  Optional<Member> lockByEmail(String email);
}
