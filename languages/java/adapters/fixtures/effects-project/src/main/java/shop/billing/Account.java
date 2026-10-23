package shop.billing;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import org.hibernate.annotations.BatchSize;

@Entity
@BatchSize(size = 20)
public class Account {
  @Id private Long id;
  private String number;

  public String getNumber() {
    return number;
  }
}
