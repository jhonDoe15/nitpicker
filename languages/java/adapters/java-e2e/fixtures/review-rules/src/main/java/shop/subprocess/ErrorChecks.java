package shop.subprocess;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

public final class ErrorChecks {
  private ErrorChecks() {}

  public static String format(Process process) throws IOException, InterruptedException {
    if (!process.waitFor(1, TimeUnit.MINUTES)) {
      throw new IllegalStateException("timed out");
    }
    String errors = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
    if (!errors.isEmpty()) { // violation: StderrAsFailure
      throw new IllegalStateException(errors);
    }
    return errors;
  }

  public static void compile(Process process) throws IOException, InterruptedException {
    if (!process.waitFor(1, TimeUnit.MINUTES)) {
      throw new IllegalStateException("timed out");
    }
    String errors = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8).trim();
    if (process.exitValue() != 0 || errors.length() > 0) { // violation: StderrAsFailure
      throw new IllegalStateException(errors);
    }
  }

  public static void lint(Process process) throws IOException, InterruptedException {
    if (!process.waitFor(1, TimeUnit.MINUTES)) {
      throw new IllegalStateException("timed out");
    }
    List<String> lines = process.errorReader().lines().toList();
    if (!lines.isEmpty()) { // violation: StderrAsFailure
      throw new IllegalStateException(String.join("\n", lines));
    }
  }

  public static void checkExit(Process process) throws IOException, InterruptedException {
    if (!process.waitFor(1, TimeUnit.MINUTES)) {
      throw new IllegalStateException("timed out");
    }
    String errors = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
    if (process.exitValue() != 0 && !errors.isEmpty()) {
      throw new IllegalStateException(errors);
    }
    if (errors.contains("FATAL")) {
      throw new IllegalStateException(errors);
    }
  }
}
