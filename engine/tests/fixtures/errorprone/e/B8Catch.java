package e;

import java.io.IOException;

class B8Catch {
  void printOnly() {
    try {
      risky();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  void printWithComment() {
    try {
      risky();
    } catch (IOException e) {
      // nothing else
      e.printStackTrace();
    }
  }

  void printAndMore() {
    try {
      risky();
    } catch (Exception e) {
      e.printStackTrace();
      System.exit(1);
    }
  }

  void printToStream() {
    try {
      risky();
    } catch (Exception e) {
      e.printStackTrace(System.err);
    }
  }

  void notThrowable(Other other) {
    try {
      risky();
    } catch (Exception e) {
      other.printStackTrace();
    }
  }

  void other() {
    try {
      risky();
    } catch (Exception e) {
      e.getMessage();
    }
  }

  void union() {
    try {
      risky();
    } catch (IllegalStateException | IOException e) {
      e.printStackTrace();
    }
  }

  void nested() throws IOException {
    try {
      risky();
    } catch (Exception e) {
      try {
        risky();
      } catch (Error inner) {
        inner.printStackTrace();
      }
    }
  }

  void thrown(Throwable t) throws IOException {
    try {
      risky();
    } catch (RuntimeException e) {
      t.printStackTrace();
    }
  }

  void viaCause() throws IOException {
    try {
      risky();
    } catch (RuntimeException e) {
      e.getCause().printStackTrace();
    }
  }

  @SuppressWarnings("CatchAndPrintStackTrace")
  void suppressed() {
    try {
      risky();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  void tryWithResources(AutoCloseable c) throws Exception {
    try (c) {
      risky();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  static class Custom extends Exception {
    void self() {
      try {
        risky();
      } catch (Exception e) {
        printStackTrace();
      }
    }
  }

  static class Other {
    void printStackTrace() {}
  }

  static void risky() throws IOException {}
}
