package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class) // violation: pmd/TestOrderDependence
class HonestyTest {
  private static List<String> names;

  @BeforeAll
  static void loadNames() {
    names = List.of("ada", "bob");
  }

  @Test
  @Order(1) // violation: pmd/TestOrderDependence
  void waits() throws InterruptedException {
    Thread.sleep(1); // violation: pmd/TestSleep
    assertEquals(2, names.size());
  }

  @Test
  @Disabled("flaky") // violation: pmd/DisabledTest
  void skipped() {
    assertEquals(2, names.size());
  }

  @Test
  void branches() {
    if (names.isEmpty()) { // violation: pmd/AssertionInControlFlow
      assertEquals(0, names.size());
    }
    for (String name : names) {
      assertEquals(3, name.length());
    }
  }

  @Test
  void catches() {
    try { // violation: pmd/TryCatchInTest
      assertEquals(3, Integer.parseInt("3"));
    } catch (NumberFormatException e) {
      assertEquals("3", e.getMessage());
    }
  }

  @Test
  void throwsOnBadInput() {
    assertThrows(NumberFormatException.class, () -> Integer.parseInt("x"));
  }

  @Test
  void compares() {
    String first = names.get(0);
    assertTrue(first.equals("ada")); // violation: pmd/AssertTrueOnEquality
    assertEquals("ada", first);
  }

  @Test
  void constant() {
    assertTrue(true); // violation: pmd/TautologicalAssertion
    assertTrue(names.contains("bob"));
  }

  @Test
  void mocks() {
    List<?> values = mock(List.class); // violation: pmd/MockedValueType
    Runnable task = mock(Runnable.class);
    task.run();
    verify(task).run();
    assertEquals(0, values.size());
  }
}
