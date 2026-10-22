package nitpicker.designfacts;

record Ty(TypeInfo type, String text) {
  static final Ty UNKNOWN = new Ty(null, null);

  static Ty of(TypeInfo type) {
    return new Ty(type, type.simple);
  }

  static Ty text(String text) {
    return new Ty(null, text);
  }

  boolean isArray() {
    return type == null && text != null && text.endsWith("[]");
  }

  String raw() {
    return text == null ? "" : text.substring(text.lastIndexOf('.') + 1);
  }

  String render() {
    return type != null ? type.id : text;
  }
}
