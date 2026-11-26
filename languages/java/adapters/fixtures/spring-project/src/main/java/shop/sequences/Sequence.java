package shop.sequences;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Version;

@Entity
public class Sequence {
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  private long current;

  protected Sequence() {}

  public Long id() {
    return id;
  }

  public long version() {
    return version;
  }

  public long current() {
    return current;
  }

  public void advance() {
    current += 1;
  }
}
