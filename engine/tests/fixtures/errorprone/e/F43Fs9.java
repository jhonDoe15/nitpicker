class F43Fs9 {
  public static void main(String[] args) {
    // BUG: Diagnostic contains: Illegal format argument index
    System.err.printf(" %0$2s) %s", args[0], args[1]);
  }
}
