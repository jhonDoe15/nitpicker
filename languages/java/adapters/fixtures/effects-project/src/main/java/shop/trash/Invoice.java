package shop.trash;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;
import org.hibernate.annotations.SQLRestriction;

@Entity
@SQLRestriction("deleted_at is null")
public class Invoice {
  @Id private Long id;
  private String number;
  private Instant deletedAt;
}
