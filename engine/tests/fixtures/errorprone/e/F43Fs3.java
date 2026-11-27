class F43Fs3 {
  void f() {
    String.format("%s %s", 1, 2);
    // BUG: Diagnostic contains: extra format arguments: used 2, provided 3
    String.format("%s %s", 1, 2, 3);
    // BUG: Diagnostic contains: extra format arguments: used 2, provided 4
    String.format("%s %s", 1, 2, 3, 4);
    // BUG: Diagnostic contains: extra format arguments: used 0, provided 1
    String.format("{0}", 1);
  }
}
