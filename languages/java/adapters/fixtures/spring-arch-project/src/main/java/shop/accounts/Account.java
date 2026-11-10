package shop.accounts;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Account {
  @Id private Long id;

  public Long id() {
    return id;
  }
}
