package shop.release;

import java.io.Closeable;
import java.io.IOException;
import java.util.Iterator;
import java.util.function.Supplier;

public final class Readers {
  private Readers() {}

  public static final class CursorReader implements Closeable {
    private final Supplier<Iterator<String>> source;
    private Iterator<String> cursor;
    private Closeable handle;

    public CursorReader(Supplier<Iterator<String>> source) {
      this.source = source;
    }

    public void open(Closeable opened) {
      cursor = source.get();
      handle = opened;
    }

    public String read() {
      return cursor.hasNext() ? cursor.next() : null;
    }

    @Override
    public void close() throws IOException {
      handle.close(); // violation: CloseDereferencesUnopenedField, CleanupSkippedOnFailure
      handle = null;
    }
  }

  public static final class GuardedReader implements Closeable {
    private Closeable handle;

    public void open(Closeable opened) {
      handle = opened;
    }

    @Override
    public void close() throws IOException {
      Closeable current = handle;
      if (current != null) {
        handle = null;
        current.close();
      }
    }
  }

  public static final class EagerReader implements Closeable {
    private final Closeable handle;
    private Closeable extra;

    public EagerReader(Closeable handle) {
      this.handle = handle;
      this.extra = handle;
    }

    public void start(Closeable replacement) {
      extra = replacement;
    }

    @Override
    public void close() throws IOException {
      extra.close();
    }

    public Closeable handle() {
      return handle;
    }
  }

  public static final class ReassignedReader implements Closeable {
    private Closeable handle;

    public void open(Closeable opened) {
      handle = opened;
    }

    public void replace(Closeable replacement) {
      handle = replacement;
    }

    @Override
    public void close() throws IOException {
      handle.close();
    }
  }

  public static final class OpenedInConstructor implements Closeable {
    private Closeable handle;

    public OpenedInConstructor(Closeable opened) {
      this.open(opened);
    }

    private void open(Closeable opened) {
      handle = opened;
    }

    @Override
    public void close() throws IOException {
      handle.close();
    }
  }
}
