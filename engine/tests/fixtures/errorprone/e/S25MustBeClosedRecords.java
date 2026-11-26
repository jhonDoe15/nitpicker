package e;

import com.google.errorprone.annotations.MustBeClosed;
import java.io.ByteArrayInputStream;
import java.io.InputStream;

class S25MustBeClosedRecords {
  static class Res implements AutoCloseable {
    @MustBeClosed
    static Res open() {
      return new Res();
    }

    @Override
    public void close() {}
  }

  record Compact(int a) {
    Compact {
      Res res = Res.open();
    }
  }

  record CompactClosed(int a) {
    CompactClosed {
      try (Res res = Res.open()) {}
    }
  }

  record Annotated(InputStream in) implements AutoCloseable {
    @MustBeClosed
    Annotated {}

    @Override
    public void close() {}
  }

  record NotCloseable(int a) {
    @MustBeClosed
    NotCloseable {}
  }

  static Annotated make() {
    return new Annotated(new ByteArrayInputStream(new byte[0]));
  }
}
