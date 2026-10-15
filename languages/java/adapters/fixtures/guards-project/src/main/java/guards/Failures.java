package guards;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Callable;

public final class Failures implements Callable<String> {
  @interface SneakyThrows {}

  @SneakyThrows // violation: pmd/SneakyThrows
  public void sneaky() {}

  public void broad() throws Exception { // violation: pmd/SignatureDeclareThrowsException
    Files.size(Path.of("a"));
  }

  public long narrow() throws IOException {
    return Files.size(Path.of("a"));
  }

  @Override
  public String call() throws Exception {
    return narrow() > 0 ? "some" : "none";
  }

  public void raw() {
    throw new RuntimeException("raw"); // violation: pmd/AvoidThrowingRawExceptionTypes
  }

  public void specific() {
    throw new IllegalStateException("specific");
  }

  public void waitFor(Object lock) {
    try {
      lock.wait();
    } catch (InterruptedException e) { // violation: pmd/SwallowedInterruptedException
      sneaky();
    }
  }

  public void waitProperly(Object lock) {
    try {
      lock.wait();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
