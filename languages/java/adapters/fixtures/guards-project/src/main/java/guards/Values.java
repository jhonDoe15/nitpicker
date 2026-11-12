package guards;

final class Values {
  @interface Value {}

  enum AccessLevel {
    PRIVATE
  }

  @interface FieldDefaults {
    AccessLevel level();
  }

  @Value
  static final class Money {
    long cents;
  }

  @FieldDefaults(level = AccessLevel.PRIVATE)
  static final class Named {
    String name;
  }
}
