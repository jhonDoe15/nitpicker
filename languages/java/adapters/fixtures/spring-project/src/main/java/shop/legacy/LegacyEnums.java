package shop.legacy;

import java.time.DayOfWeek;
import java.util.HashSet;
import java.util.Set;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;
import javax.persistence.GeneratedValue;
import javax.persistence.Id;
import javax.persistence.Version;

@Entity
class LegacyAccount {
  @Id @GeneratedValue private Long id;
  @Version private long version;

  @ElementCollection
  private Set<DayOfWeek> days = new HashSet<>(); // violation: JpaEnumString

  @ElementCollection
  @Enumerated(EnumType.STRING)
  private Set<DayOfWeek> workdays = new HashSet<>();

  private DayOfWeek start; // violation: JpaEnumString

  @Enumerated(EnumType.STRING)
  private DayOfWeek end;
}
