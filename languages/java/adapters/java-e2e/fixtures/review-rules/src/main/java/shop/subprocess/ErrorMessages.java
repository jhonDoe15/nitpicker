package shop.subprocess;

import java.io.PrintWriter;
import java.io.StringWriter;

public final class ErrorMessages {
  private static final int LIMIT = 4000;

  private ErrorMessages() {}

  public static IllegalStateException buildFailed(String errorOutput) {
    int end = Math.min(errorOutput.length(), LIMIT);
    return new IllegalStateException("build failed: " + errorOutput.substring(0, end)); // violation: HeadCutErrorOutput
  }

  public static IllegalStateException toolFailed(String stderr) {
    String head = stderr.trim().substring(0, Math.min(stderr.trim().length(), LIMIT)); // violation: HeadCutErrorOutput
    return new IllegalStateException(head);
  }

  public static IllegalStateException wrapped(Exception cause) {
    StringWriter trace = new StringWriter();
    cause.printStackTrace(new PrintWriter(trace));
    String text = trace.toString();
    return new IllegalStateException(
        trace.toString().substring(0, Math.min(text.length(), LIMIT))); // violation: HeadCutErrorOutput
  }

  public static IllegalStateException tail(String output) {
    return new IllegalStateException(output.substring(Math.max(0, output.length() - LIMIT)));
  }

  public static IllegalStateException bothEnds(String output) {
    int half = Math.min(output.length(), LIMIT) / 2;
    return new IllegalStateException(
        output.substring(0, half) + " ... " + output.substring(output.length() - half));
  }

  public static String preview(String output) {
    return output.substring(0, Math.min(output.length(), LIMIT));
  }
}
