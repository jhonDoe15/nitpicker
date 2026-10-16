package guards;

import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.concurrent.ThreadFactory;

public final class Legacy {
  public Object stamp() {
    return new Date(0L); // violation: forbiddenapis/legacy-date-time
  }

  public Instant expiry(X509Certificate certificate) {
    return certificate.getNotAfter().toInstant();
  }

  public Instant now() {
    return Instant.now(); // violation: forbiddenapis/clock-now
  }

  public Instant now(Clock clock) {
    return Instant.now(clock);
  }

  public void pause() throws InterruptedException {
    Thread.sleep(1); // violation: forbiddenapis/thread-sleep
  }

  public void spawn(Runnable work) {
    new Thread(work).start(); // violation: forbiddenapis/new-thread
  }

  public ThreadFactory daemons() {
    return work -> {
      Thread thread = new Thread(work, "worker");
      thread.setDaemon(true);
      return thread;
    };
  }

  public void onExit(Runnable work) {
    Runtime.getRuntime().addShutdownHook(new Thread(work));
  }

  public Process run(String command) throws IOException {
    return Runtime.getRuntime().exec(command); // violation: forbiddenapis/runtime-exec, javac/deprecation
  }

  public Process runArguments(String program) throws IOException {
    return new ProcessBuilder(program, "--version").start();
  }

  public Object read(InputStream input) throws IOException, ClassNotFoundException {
    try (ObjectInputStream objects = new ObjectInputStream(input)) { // violation: forbiddenapis/java-deserialization
      return objects.readObject();
    }
  }
}
