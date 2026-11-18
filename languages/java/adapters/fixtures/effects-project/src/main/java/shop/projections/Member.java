package shop.projections;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;

@Entity
public class Member {
  @Id private Long id;
  private String email;
  private String name;

  @Transient private String label;

  public String getEmail() {
    return email;
  }

  public String getName() {
    return name;
  }

  public String getLabel() {
    return label;
  }
}
