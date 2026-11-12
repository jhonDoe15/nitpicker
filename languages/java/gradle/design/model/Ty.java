package nitpicker.designfacts.model;

public record Ty(TypeInfo type, String text) {
  public static final Ty UNKNOWN = new Ty(null, null);

  public static Ty of(TypeInfo type) {
    return new Ty(type, type.simple);
  }

  public static Ty text(String text) {
    return new Ty(null, text);
  }

  public boolean isArray() {
    return type == null && text != null && text.endsWith("[]");
  }

  public String raw() {
    return text == null ? "" : text.substring(text.lastIndexOf('.') + 1);
  }

  public String render() {
    return type != null ? type.id : text;
  }
}
