package shop.entities;

import jakarta.persistence.Convert;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.MapKeyEnumerated;
import jakarta.persistence.Version;
import java.time.DayOfWeek;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

enum Role {
  ADMIN,
  USER
}

@Entity
class Account {
  @Id @GeneratedValue private Long id;
  @Version private long version;

  @ElementCollection
  private Set<Role> roles = new HashSet<>(); // violation: JpaEnumString

  @ElementCollection
  @Enumerated(EnumType.STRING)
  private Set<Role> grants = new HashSet<>();

  @ElementCollection
  private Set<DayOfWeek> days = new HashSet<>(); // violation: JpaEnumString

  @ElementCollection
  private List<String> tags;

  @ElementCollection
  private Map<Role, String> notes = new HashMap<>(); // violation: JpaEnumString

  @ElementCollection
  @MapKeyEnumerated(EnumType.STRING)
  private Map<Role, String> labels = new HashMap<>();

  @ElementCollection
  @MapKeyEnumerated(EnumType.STRING)
  private Map<Role, DayOfWeek> shifts = new HashMap<>(); // violation: JpaEnumString

  @ElementCollection
  @MapKeyEnumerated(EnumType.STRING)
  @Enumerated(EnumType.STRING)
  private Map<Role, DayOfWeek> rotas = new HashMap<>();

  @ElementCollection
  @Convert(converter = StatusConverter.class)
  private Set<DayOfWeek> converted = new HashSet<>();
}
