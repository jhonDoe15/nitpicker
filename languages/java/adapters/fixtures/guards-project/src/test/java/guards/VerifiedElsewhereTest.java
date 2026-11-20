package guards;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.ParameterContext;
import org.junit.jupiter.api.extension.ParameterResolver;

class VerifiedElsewhereTest {
  @Test
  void assertsInsideACallback() {
    inTransaction(session -> assertThat(session).isEqualTo("session"));
  }

  @TestFactory
  Stream<DynamicTest> everyCase() {
    return Stream.of("ada").map(name -> dynamicTest(name, () -> assertEquals(3, name.length())));
  }

  @Test
  void callbackWithoutAssertion() { // violation: pmd/UnitTestShouldIncludeAssert
    inTransaction(String::length);
  }

  private static void inTransaction(Consumer<String> work) {
    work.accept("session");
  }
}

final class Recorder {
  private final StringBuilder calls = new StringBuilder();

  String post(String path) {
    calls.append(path);
    return path;
  }

  String recorded() {
    return calls.toString();
  }
}

final class RecorderExtension implements AfterEachCallback, ParameterResolver {
  private final Recorder recorder = new Recorder();

  @Override
  public void afterEach(ExtensionContext context) {
    assertEquals("/orders/7/cancel", recorder.recorded());
  }

  @Override
  public boolean supportsParameter(ParameterContext parameter, ExtensionContext context) {
    return parameter.getParameter().getType() == Recorder.class;
  }

  @Override
  public Object resolveParameter(ParameterContext parameter, ExtensionContext context) {
    return recorder;
  }
}

@ExtendWith(RecorderExtension.class)
class RecordedContractTest {
  @Test
  void cancelIsRecorded(Recorder recorder) {
    recorder.post("/orders/7/cancel");
  }

  @Test
  void recorderLeftUnused(Recorder recorder) { // violation: pmd/UnitTestShouldIncludeAssert
    inert();
  }

  private static void inert() {
    Math.abs(1);
  }
}
