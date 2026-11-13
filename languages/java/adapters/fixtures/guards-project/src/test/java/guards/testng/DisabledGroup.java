package guards.testng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class DisabledGroup {
  @Test(enabled = false) // violation: pmd/DisabledTest
  void switchedOff() {
    assertEquals(1, Integer.parseInt("1"));
  }

  @Test(enabled = true)
  void switchedOn() {
    assertEquals(1, Integer.parseInt("1"));
  }

  @Test
  void assumesForGood() {
    assumeTrue(false, "never"); // violation: pmd/DisabledTest
    assumeTrue(!true); // violation: pmd/DisabledTest
    assertEquals(1, Integer.parseInt("1"));
  }
}
