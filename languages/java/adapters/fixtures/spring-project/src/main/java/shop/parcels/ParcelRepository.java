package shop.parcels;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

@Transactional
public interface ParcelRepository extends JpaRepository<Parcel, Long> {
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Parcel p set p.status = 'LOST' where p.id = :id")
  int lose(@Param("id") Long id);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Parcel p set p.status = 'LOST' where p.status = :status")
  void loseAll(@Param("status") String status);

  @Query("select count(p) from Parcel p where p.status = :status")
  int countInStatus(@Param("status") String status);

  @Query("select p from Parcel p where p.status = :status")
  List<Parcel> inStatus(@Param("status") String status);
}
