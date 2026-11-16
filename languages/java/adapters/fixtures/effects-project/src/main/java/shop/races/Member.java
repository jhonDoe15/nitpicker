package shop.races;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Member {
  @Id private Long id;
  private String email;
  private String name;
  private String team;

  public Member() {}

  public Member(String email) {
    this.email = email;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }
}
