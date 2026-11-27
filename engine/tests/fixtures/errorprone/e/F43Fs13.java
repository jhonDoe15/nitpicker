class F43Fs13 {
  public static void main() {
    final String formatString = " %0$2s) %s";
    // BUG: Diagnostic contains:
    System.err.printf(formatString, "foo", "bar");
  }
}
