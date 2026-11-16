package shop.entries;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EntryRepository extends JpaRepository<Entry, Long> {
  @Query("select e from Entry e where e.account = :account")
  List<Entry> forAccount(@Param("account") String account);

  @Query("select e.account from Entry e")
  List<String> accounts();
}
