package guards.callbacks;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

class CallbacksTest {
  @FunctionalInterface
  interface Check {
    void on(String name);
  }

  private static Check hasLength(int length) {
    return name -> assertThat(name).hasSize(length);
  }

  private static Consumer<String> isUpper() {
    return name -> assertThat(name).isUpperCase();
  }

  private static String name() {
    return "ADA";
  }

  private static void run(Check check) {
    check.on(name());
  }

  @Test
  void dropsAHelperCheck() {
    hasLength(3); // violation: pmd/DroppedCallbackInTest
  }

  @Test
  void dropsTheCheckInALambda() {
    run(name -> hasLength(3)); // violation: pmd/DroppedCallbackInTest
  }

  @Test
  void dropsAConsumer() {
    isUpper(); // violation: pmd/DroppedCallbackInTest
  }

  @Test
  void runsTheCheck() {
    run(hasLength(3));
    isUpper().accept(name());
    hasLength(3).on(name());
  }

  @Test
  void registersCallbacksWithoutDroppingThem() {
    Map<String, Runnable> handlers = new HashMap<>();
    handlers.put("a", () -> assertThat(name()).hasSize(3));
    CallbacksTest.hasLength(3);
  }

  @Test
  void setsTheMessageAfterTheAssertion() {
    assertThat(name()).hasSize(3).as("length"); // violation: pmd/MessageAfterAssertion
    assertThat(name()).isUpperCase().withFailMessage("case"); // violation: pmd/MessageAfterAssertion
  }

  @Test
  void setsTheMessageFirst() {
    assertThat(name()).as("length").hasSize(3);
    assertThat(name()).withFailMessage("case").isUpperCase();
    assertThat(List.of(name())).extracting(String::length).as("length").containsExactly(3);
  }
}
