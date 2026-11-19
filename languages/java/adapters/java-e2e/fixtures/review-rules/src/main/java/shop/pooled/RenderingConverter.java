package shop.pooled;

import jakarta.persistence.AttributeConverter;

public final class RenderingConverter implements AttributeConverter<Rendering, String> {
  @Override
  public String convertToDatabaseColumn(Rendering attribute) {
    return attribute.html();
  }

  @Override
  public Rendering convertToEntityAttribute(String dbData) {
    return new Rendering() {
      @Override
      public String html() {
        return dbData;
      }
    };
  }
}
