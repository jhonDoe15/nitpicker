package shop.sequences;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SequenceRepository extends JpaRepository<Sequence, Long> {
  @Query("select s from Sequence s where s.current > :current")
  List<Sequence> updatedSince(@Param("current") long current);
}
