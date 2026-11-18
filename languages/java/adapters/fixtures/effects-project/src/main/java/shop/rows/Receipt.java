package shop.rows;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Version;

@Entity
public class Receipt {
  @Id private Long id;
  @Version private Long version;
  private String status;

  public void setStatus(String status) {
    this.status = status;
  }
}
