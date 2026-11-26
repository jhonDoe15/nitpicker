package e;

import com.google.testing.junit.testparameterinjector.TestParameter;
import com.google.testing.junit.testparameterinjector.TestParameterInjector;
import com.google.testing.junit.testparameterinjector.TestParameters;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(TestParameterInjector.class)
public class S19Param {
  enum MyEnum {
    FOO,
    BAR
  }

  enum Pending {
    OPEN,
    OPEN_PENDING
  }

  enum Empty {}

  @Test
  @TestParameters({"{mode: FOO}", "{mode: BAR}"})
  public void myTest(MyEnum mode) {}

  @Test
  @TestParameters("{mode: FOO}")
  @TestParameters("{mode: BAR}")
  public void repeated(MyEnum mode) {}

  @Test
  @TestParameters(value = {"{b: true}", "{b: false}"})
  public void booleanParameter(boolean b) {}

  @Test
  @TestParameters({"{b: true}", "{b: false}"})
  public void boxedParameter(Boolean b) {}

  @Test
  @TestParameters({"{mode: BAR}", "{mode: FOO}"})
  public void reordered(final MyEnum mode) {}

  @TestParameters({"{mode: FOO}", "{mode: BAR}"})
  @Test
  public void annotationFirst(@SuppressWarnings("x") MyEnum mode) {}

  @Test
  @TestParameters({"{mode: FOO, b: true}", "{mode: BAR, b: false}"})
  public void tooManyParams(MyEnum mode, boolean b) {}

  @Test
  @TestParameters(
      customName = "foo",
      value = {"{mode: FOO}", "{mode: BAR}"})
  public void customName(MyEnum mode) {}

  @Test
  @TestParameters({"{mode: OPEN_PENDING}", "{mode: OPEN_PENDING}"})
  public void substringMatch(Pending mode) {}

  @Test
  @TestParameters({"{mode: OPEN}", "{mode: OPEN_PENDING}"})
  public void pendingAll(Pending mode) {}

  @Test
  @TestParameters({"{mode: FOO}"})
  public void missingOne(MyEnum mode) {}

  @Test
  @TestParameters({"{mode: FOO}", "{mode: BAR}", "{mode: FOO}"})
  public void tooMany(MyEnum mode) {}

  @Test
  @TestParameters({"{mode: FOO}", "{mode: BAR}"})
  public void alreadyAnnotated(@TestParameter MyEnum mode) {}

  @Test
  @TestParameters({"{s: a}", "{s: b}"})
  public void notEnum(String s) {}

  @Test
  public void noAnnotation(MyEnum mode) {}

  @Test
  @TestParameters({})
  public void emptyEnum(Empty mode) {}

  @Test
  @TestParameters({"{mode: FOO}", "{mode: BAR}"})
  public void noParams() {}

  static final String FIRST = "{mode: FOO}";

  @Test
  @TestParameters({FIRST, "{mode: " + "BAR" + "}"})
  public void constants(MyEnum mode) {}

  @Test
  @SuppressWarnings("PreferTestParameter")
  @TestParameters({"{mode: FOO}", "{mode: BAR}"})
  public void suppressed(MyEnum mode) {}

  @Test
  @TestParameters({"{b: true}", "{b: false}"})
  public void spread(boolean... b) {}

  @Test
  @TestParameters({"{b: true}", "{b: true}"})
  public void booleanTwice(boolean b) {}
}
