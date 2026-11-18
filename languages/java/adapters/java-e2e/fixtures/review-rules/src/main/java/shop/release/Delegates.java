package shop.release;

import java.io.Closeable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public final class Delegates implements Closeable {
  public interface Listener {
    void stop();
  }

  private final List<Closeable> readers;
  private final List<Closeable> writers;
  private final Closeable[] streams;
  private final List<Listener> listeners = new ArrayList<>();

  public Delegates(List<Closeable> readers, List<Closeable> writers, Closeable[] streams) {
    this.readers = readers;
    this.writers = writers;
    this.streams = streams;
  }

  @Override
  public void close() throws IOException {
    for (Closeable reader : readers) {
      reader.close(); // violation: CleanupLoopStopsOnFailure
    }
  }

  public void shutdown() {
    writers.forEach(writer -> {
      try {
        writer.close();
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    });
  }

  public void stop() throws IOException {
    for (Closeable stream : streams) {
      stream.close(); // violation: CleanupLoopStopsOnFailure
    }
  }

  public void disconnect() throws IOException {
    List<IOException> failures = new ArrayList<>();
    for (Closeable writer : writers) {
      try {
        writer.close();
      } catch (IOException e) {
        failures.add(e);
      }
    }
    if (!failures.isEmpty()) {
      IOException first = failures.get(0);
      failures.stream().skip(1).forEach(first::addSuppressed);
      throw first;
    }
  }

  public void cleanup() throws IOException {
    for (Closeable reader : readers) {
      reader.toString();
    }
    for (Closeable writer : writers) {
      try (writer) {
        writer.hashCode();
      }
    }
  }

  public void destroy() {
    listeners.forEach(Listener::stop); // violation: CleanupLoopStopsOnFailure
  }

  public void teardown(List<Object> items) throws IOException {
    for (Object item : items) {
      ((Closeable) item).close(); // violation: CleanupLoopStopsOnFailure
    }
  }

  public void open() throws IOException {
    for (Closeable reader : readers) {
      reader.close();
    }
  }
}
