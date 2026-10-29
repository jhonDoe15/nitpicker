package shop.batches;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Version;

@Entity
public class Shades {
  public enum Shade {
    LIGHT,
    DARK
  }

  public enum Tone {
    WARM,
    COLD
  }

  public abstract static class NameConverter<E extends Enum<E>> implements AttributeConverter<E, String> {
    private final Class<E> type;

    protected NameConverter(Class<E> type) {
      this.type = type;
    }

    @Override
    public String convertToDatabaseColumn(E value) {
      return value == null ? null : value.name();
    }

    @Override
    public E convertToEntityAttribute(String value) {
      return value == null ? null : Enum.valueOf(type, value);
    }
  }

  @Converter(autoApply = true)
  public static class ShadeConverter extends NameConverter<Shade> {
    public ShadeConverter() {
      super(Shade.class);
    }
  }

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  private Shade shade;

  private Tone tone; // violation: JpaEnumString
}
