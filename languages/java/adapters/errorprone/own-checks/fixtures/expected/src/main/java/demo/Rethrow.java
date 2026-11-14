package demo;

public class Rethrow {
  static class Plain extends Exception {
    Plain(String message) {
      super(message);
    }
  }

  void lost(Object value) {
    try {
      value.toString();
    } catch (IllegalStateException e) {
      throw new RuntimeException("lost", e);
    }
  }

  void message(Object value) {
    try {
      value.toString();
    } catch (IllegalStateException e) {
      throw new IllegalArgumentException(e.getMessage(), e);
    }
  }

  void kept(Object value) {
    try {
      value.toString();
    } catch (IllegalStateException e) {
      throw new RuntimeException("kept", e);
    }
  }

  void noCauseConstructor(Object value) throws Plain {
    try {
      value.toString();
    } catch (IllegalStateException e) {
      throw new Plain("no cause constructor");
    }
  }
}
