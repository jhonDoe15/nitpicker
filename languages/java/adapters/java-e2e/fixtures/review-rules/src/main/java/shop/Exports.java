package shop;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

public final class Exports {
  private static final long DEADLINE_SECONDS = 30;

  private Exports() {}

  public static int render(List<String> command) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(command).inheritIO().start();
    return process.waitFor(); // violation: ProcessWaitWithoutTimeout
  }

  public static String version(List<String> command) throws IOException {
    Process process = new ProcessBuilder(command).start();
    byte[] output = process.getInputStream().readAllBytes(); // violation: ProcessWaitWithoutTimeout
    return new String(output, StandardCharsets.UTF_8);
  }

  public static String errors(List<String> command) throws IOException {
    Process process = new ProcessBuilder(command).start();
    return process.errorReader().lines().collect(Collectors.joining("\n")); // violation: ProcessWaitWithoutTimeout
  }

  public static List<String> lines(List<String> command) throws IOException {
    Process process = new ProcessBuilder(command).start();
    try (BufferedReader reader =
        new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
      List<String> lines = new ArrayList<>();
      String line = reader.readLine(); // violation: ProcessWaitWithoutTimeout
      while (line != null) {
        lines.add(line);
        line = reader.readLine(); // violation: ProcessWaitWithoutTimeout
      }
      return lines;
    }
  }

  public static void copy(List<String> command, OutputStream target) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(command).start();
    try (InputStream output = process.getInputStream()) {
      output.transferTo(target); // violation: ProcessWaitWithoutTimeout
    }
    if (!process.waitFor(DEADLINE_SECONDS, TimeUnit.SECONDS)) {
      process.destroyForcibly();
    }
  }

  public static Process finish(List<String> command) throws IOException {
    return new ProcessBuilder(command).start().onExit().join(); // violation: ProcessWaitWithoutTimeout
  }

  public static int bounded(List<String> command) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(command).start();
    if (!process.waitFor(DEADLINE_SECONDS, TimeUnit.SECONDS)) {
      process.destroyForcibly();
      throw new IllegalStateException("timed out: " + command);
    }
    return process.exitValue();
  }

  public static String boundedOutput(List<String> command) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(command).start();
    CompletableFuture<byte[]> output = CompletableFuture.supplyAsync(() -> readAll(process.getInputStream()));
    if (!process.waitFor(DEADLINE_SECONDS, TimeUnit.SECONDS)) {
      process.destroyForcibly();
      throw new IllegalStateException("timed out: " + command);
    }
    return new String(output.join(), StandardCharsets.UTF_8); // violation: UnboundedWait
  }

  public static String afterExit(List<String> command) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
    if (!process.waitFor(DEADLINE_SECONDS, TimeUnit.SECONDS)) {
      process.destroyForcibly();
      throw new IllegalStateException("timed out: " + command);
    }
    return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
  }

  private static byte[] readAll(InputStream stream) {
    try {
      return stream.readAllBytes();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
