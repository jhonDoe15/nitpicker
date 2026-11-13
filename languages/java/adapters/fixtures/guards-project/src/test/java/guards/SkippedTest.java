package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

class SkippedTest {
  @Test
  void skipsForGood() {
    assumeTrue(false); // violation: pmd/DisabledTest
    assertEquals(1, Integer.parseInt("1"));
  }

  @Test
  void skipsForGoodInverted() {
    assumeFalse(true, "never"); // violation: pmd/DisabledTest
    assertEquals(1, Integer.parseInt("1"));
  }

  @Test
  void skipsOnARealCondition() {
    assumeTrue(System.getenv("HOME") != null);
    assertEquals(1, Integer.parseInt("1"));
  }

  @Test
  @EnabledOnOs(OS.LINUX)
  void runsOnLinux() {
    assertEquals(1, Integer.parseInt("1"));
  }
}
