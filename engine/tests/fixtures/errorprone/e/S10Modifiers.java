package e;

import static com.google.errorprone.annotations.Modifier.ABSTRACT;
import static com.google.errorprone.annotations.Modifier.FINAL;
import static com.google.errorprone.annotations.Modifier.PRIVATE;
import static com.google.errorprone.annotations.Modifier.PUBLIC;

import com.google.errorprone.annotations.IncompatibleModifiers;
import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@IncompatibleModifiers(modifier = {PRIVATE, FINAL})
@interface S10NotPrivateOrFinal {}

@IncompatibleModifiers(modifier = {PUBLIC, FINAL})
@interface S10NotPublicOrFinal {}

@IncompatibleModifiers(modifier = ABSTRACT)
@interface S10NotAbstract {}

@interface S10Foos {
  S10Foo[] value();
}

@interface S10Foo {}

@S10NotAbstract
abstract class S10AbstractAnnotated {}

@S10NotAbstract
class S10ConcreteAnnotated {}

public class S10Modifiers {
  @S10NotPrivateOrFinal public final int n = 0;

  @S10NotPrivateOrFinal
  private void foo() {}

  @S10NotPublicOrFinal public static final int FOO = 0;

  @S10NotPublicOrFinal
  static final int BAR = 0;

  @S10NotPrivateOrFinal
  public void fine() {}

  @S10NotPrivateOrFinal
  protected final synchronized void multi() {}

  @SuppressWarnings("IncompatibleModifiers")
  @S10NotPrivateOrFinal
  private void suppressed() {}

  void param(@S10NotPrivateOrFinal final int x) {}

  @S10NotAbstract
  abstract static class Nested {}

  @S10NotAbstract
  interface Iface {}
}

@S10Foos({@S10Foo, @S10Foo})
class S10Foos1 {}
