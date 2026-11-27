class F43Fs14 {
  public static void main() {
    String formatString = " %0$2s) %s";
    System.err.printf(formatString, "foo", "bar");
  }
}
