package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
import java.util.Objects;

@Entity
public class Branch {
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  private String code;

  protected Branch() {}

  @Override
  public boolean equals(Object other) {
    return other instanceof Branch branch && Objects.equals(code, branch.code);
  }

  @Override
  public int hashCode() {
    return Objects.hash(code);
  }
}
