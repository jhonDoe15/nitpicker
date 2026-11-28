package e.other;

import com.google.errorprone.annotations.ForOverride;
import e.S14ForOverrideBase;

public class S14ForOverrideUse extends S14ForOverrideBase<String> {
  @Override
  protected int overrideMe() {
    return super.overrideMe();
  }

  protected int overrideMe(int a, int b) {
    return super.overrideMe(a);
  }

  public void circumventer() {
    overrideMe();
    this.overrideMe(1);
    S14ForOverrideBase.staticMethod();
    callMe();
  }

  protected void other() {
    super.overrideMe();
  }

  private final int k = super.overrideMe();

  @Override
  protected int overrideMe(int a) {
    return S14ForOverrideUse.super.overrideMe(a);
  }

  protected int viaAnonymous() {
    return new Object() {
      final int k = S14ForOverrideUse.super.overrideMe();

      int foo() {
        return S14ForOverrideUse.super.overrideMe();
      }
    }.foo();
  }

  @ForOverride
  public void publicOverride() {}

  @ForOverride
  protected void generic(String value, java.util.List<String> list) {
    super.generic(value, list);
  }

  @SuppressWarnings("ForOverride")
  void suppressed(S14ForOverrideBase<String> base) {
    base.callMe();
  }

  void viaVariable(S14ForOverrideBase<String> base) {
    base.callMe();
  }
}

class S14ForOverridePublic extends S14ForOverrideBase<String> {
  @Override
  public int overrideMe() {
    return 1;
  }

  @Override
  public int overrideMe(int a) {
    return 1;
  }

  @Override
  public void generic(String value, java.util.List<String> list) {}

  @SuppressWarnings("ForOverride")
  public void tooPublic() {}
}

class S14ForOverrideMethods {
  @ForOverrideLocal
  public void myMethod() {}

  @com.google.errorprone.annotations.ForOverride
  public void publicOne() {}

  @com.google.errorprone.annotations.ForOverride
  private void privateOne() {}

  @com.google.errorprone.annotations.ForOverride
  protected void protectedOne() {}

  @com.google.errorprone.annotations.ForOverride
  void packageOne() {}

  void call(S14ForOverrideBase<String> base) {
    base.callMe();
    new S14ForOverrideMethods().protectedOne();
    new S14ForOverrideMethods().packageOne();
  }

  @interface ForOverrideLocal {}
}

interface S14ForOverrideInterface {
  @com.google.errorprone.annotations.ForOverride
  void myMethod();
}
