package audit;

public class Types {
  static class Parameter {
    public void take(String value) {}
  }

  static class Returned {
    public String name() {
      return "";
    }
  }

  static class FieldType {
    private int count;
  }

  static class Visibility {
    void open() {}
  }

  static class Final {
    public void run() {}
  }

  static class Annotated {
    String label;
  }

  static class Arity {
    Arity(int value) {}
  }

  static class Sealed {}

  static class Listed {}

  static class Spread {
    void all(String... values) {}
  }

  static class Dropped {
    @Deprecated
    void old() {}
  }
}
