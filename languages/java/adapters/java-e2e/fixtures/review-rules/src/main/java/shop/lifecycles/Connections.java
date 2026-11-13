package shop.lifecycles;

import java.io.Closeable;
import java.io.IOException;

public final class Connections implements AutoCloseable {
  private final Closeable producer;
  private final Closeable consumer;
  private Object state = new Object();

  public Connections(Closeable producer, Closeable consumer) {
    this.producer = producer;
    this.consumer = consumer;
  }

  @Override
  public void close() throws IOException {
    producer.close(); // violation: CleanupSkippedOnFailure
    consumer.close();
    state = null;
  }

  public void shutdown() throws IOException {
    try (Closeable first = producer;
        Closeable second = consumer) {
      state = null;
    }
  }

  public void disconnect() throws IOException {
    try {
      producer.close();
    } finally {
      state = null;
    }
  }

  public void start() throws IOException {
    producer.close();
    consumer.close();
  }

  public Object state() {
    return state;
  }
}
