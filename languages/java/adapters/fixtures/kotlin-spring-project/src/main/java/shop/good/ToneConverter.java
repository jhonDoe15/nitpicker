package shop.good;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class ToneConverter implements AttributeConverter<Tone, String> {
  @Override
  public String convertToDatabaseColumn(Tone tone) {
    return tone == null ? null : tone.name();
  }

  @Override
  public Tone convertToEntityAttribute(String value) {
    return value == null ? null : Tone.valueOf(value);
  }
}
