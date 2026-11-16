package shop.projections;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, Long> {
  List<Member> findByTeam(String team);

  long countByEmail(String email);

  Optional<Member> findByEmail(String email);
}
