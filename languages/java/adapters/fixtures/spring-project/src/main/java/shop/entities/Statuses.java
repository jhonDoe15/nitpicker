package shop.entities;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
import java.time.DayOfWeek;

enum Status {
  OPEN,
  CLOSED
}

@Converter(autoApply = true)
class StatusConverter implements AttributeConverter<Status, String> {
  @Override
  public String convertToDatabaseColumn(Status status) {
    return status.name();
  }

  @Override
  public Status convertToEntityAttribute(String value) {
    return Status.valueOf(value);
  }
}

@Entity
class Ticket {
  @Id @GeneratedValue private Long id;
  @Version private long version;
  private Status status;
  private DayOfWeek day; // violation: JpaEnumString
}
