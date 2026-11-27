class F43Fs4 {
  void f(boolean b) {
    String.format("%d", 42);
    String.format("%d", 42L);
    String.format("%f", 42.0f);
    String.format("%f", 42.0d);
    String.format("%s", "hello");
    String.format("%s", 42);
    String.format("%s", (Object) null);
    String.format("%s", new Object());
    String.format("%c", 'c');
    String.format(b ? "%s" : "%d", 42);
    String.format("%#s", this);
  }
}
