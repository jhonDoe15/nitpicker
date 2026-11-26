package e;

class B8Finalize {
  static class Protected {
    @Override
    protected void finalize() throws Throwable {
      super.finalize();
    }
  }

  static class Public {
    @Override
    public void finalize() {}
  }

  static class WithParameter {
    protected void finalize(int x) {}
  }

  interface Iface {
    void finalize();
  }

  interface IfaceDefault {
    default void finalize() {}
  }

  interface IfacePrivate {
    private void finalize() {}
  }

  @SuppressWarnings("Finalize")
  static class Suppressed {
    protected void finalize() {}
  }

  static class Suppressed2 {
    @SuppressWarnings("Finalize")
    protected void finalize() {}
  }

  static void anon() {
    Object o =
        new Object() {
          @Override
          protected void finalize() {}
        };
  }
}
