package e;

import static com.google.errorprone.annotations.Modifier.ABSTRACT;
import static com.google.errorprone.annotations.Modifier.FINAL;
import static com.google.errorprone.annotations.Modifier.PRIVATE;
import static com.google.errorprone.annotations.Modifier.PUBLIC;
import static com.google.errorprone.annotations.Modifier.STATIC;

import com.google.errorprone.annotations.Modifier;
import com.google.errorprone.annotations.RequiredModifiers;
import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@RequiredModifiers(modifier = ABSTRACT)
@interface T1AbstractRequired {}

@RequiredModifiers(modifier = {PUBLIC, FINAL})
@interface T1PublicAndFinalRequired {}

@RequiredModifiers(modifier = {FINAL, STATIC, PUBLIC, FINAL})
@interface T1Unordered {}

@RequiredModifiers(modifier = {})
@interface T1Nothing {}

@RequiredModifiers(modifier = Modifier.PRIVATE)
@interface T1Private {}

@Target({ElementType.TYPE_USE, ElementType.FIELD})
@RequiredModifiers(modifier = FINAL)
@interface T1TypeUse {}

@T1AbstractRequired
class T1Concrete {}

@T1AbstractRequired
abstract class T1Abstract {}

@T1AbstractRequired
@T1PublicAndFinalRequired
class T1Both {}

public class T1Required {
  @T1PublicAndFinalRequired int n = 0;

  @T1PublicAndFinalRequired public int m = 0;

  @T1PublicAndFinalRequired final int k = 0;

  @T1PublicAndFinalRequired public final int ok = 0;

  @T1PublicAndFinalRequired
  private void foo() {}

  @T1PublicAndFinalRequired
  public void bar() {}

  @T1PublicAndFinalRequired
  final void baz() {}

  @T1Unordered int unordered = 0;

  @T1Unordered
  protected synchronized void sync() {}

  @T1Unordered
  <T> void generic() {}

  @T1Nothing int nothing = 0;

  @T1Private int priv = 0;

  @SuppressWarnings("RequiredModifiers")
  @T1PublicAndFinalRequired
  int suppressed = 0;

  void param(@T1PublicAndFinalRequired int x, @T1TypeUse final int y) {
    @T1TypeUse int local = 0;
  }

  java.util.List<@T1TypeUse String> typeUse;

  enum E {
    @T1PublicAndFinalRequired
    A,
    @T1AbstractRequired
    B,
    @T1Private
    C,
    @S10NotPublicOrFinal
    D,
    @S10NotAbstract
    F
  }

  @T1AbstractRequired
  interface Iface {}

  @T1PublicAndFinalRequired
  T1Required() {}

  @T1Unordered
  static class Nested {}
}
