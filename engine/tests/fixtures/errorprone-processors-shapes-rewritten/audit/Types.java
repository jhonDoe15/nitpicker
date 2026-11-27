package audit;

public class Types {
  static class Parameter {
    public void take(Object value) {}
  }

  static class Returned {
    public Object name() {
      return "";
    }
  }

  static class FieldType {
    private long count;
  }

  static class Visibility {
    public void open() {}
  }

  static class Final {
    public final void run() {}
  }

  static class Annotated {
    @Deprecated String label;
  }

  static class Arity {
    Arity(int value, int more) {}
  }

  static final class Sealed {}

  static class Listed implements java.io.Serializable {}

  static class Spread {
    void all(String[] values) {}
  }

  static class Dropped {
    void old() {}
  }
}
