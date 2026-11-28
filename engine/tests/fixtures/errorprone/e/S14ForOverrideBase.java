package e;

import com.google.errorprone.annotations.ForOverride;

public class S14ForOverrideBase<T> {
  @ForOverride
  protected int overrideMe() {
    return 1;
  }

  @ForOverride
  protected int overrideMe(int a) {
    return 1;
  }

  @ForOverride
  protected void generic(T value, java.util.List<String> list) {}

  public final void callMe() {
    overrideMe();
    new Object() {
      void inner() {
        overrideMe();
      }
    }.inner();
  }

  private class Inner {
    void invoke() {
      overrideMe();
    }
  }

  public Runnable runner() {
    return new Runnable() {
      public void run() {
        overrideMe();
      }
    };
  }

  @ForOverride
  public void tooPublic() {}

  @ForOverride
  private void tooPrivate() {}

  @ForOverride
  void packagePrivate() {}

  @ForOverride
  protected static void staticMethod() {}
}
