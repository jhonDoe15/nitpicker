package shop.rows;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Ticket {
  @Id private Long id;
  private String status;

  public Long getId() {
    return id;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
