package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
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
    Thread.sleep(1);
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
    for (String name : names) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
    }
    int index = 0;
    while (index < names.size()) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, names.get(index).length());
      index++;
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
  void parsesLater() {
    Supplier<Integer> parse =
        () -> {
          try {
            return Integer.parseInt(names.get(0));
          } catch (NumberFormatException e) {
            return -1;
          }
        };
    assertEquals(-1, parse.get());
  }

  @Test
  void throwsOnBadInput() {
    assertThrows(NumberFormatException.class, () -> Integer.parseInt("x"));
  }

  @Test
  void compares() {
    String first = names.get(0);
    assertTrue(first.equals("ada"));
    assertEquals("ada", first);
  }

  @Test
  void constant() {
    assertTrue(true); // violation: pmd/TautologicalAssertion
    assertTrue(false); // violation: pmd/AlwaysFailingAssertion
    assertFalse(true, "unreachable"); // violation: pmd/AlwaysFailingAssertion
    assertTrue(names.contains("bob"));
  }

  @Test
  void mocks() {
    List<?> values = mock(List.class);
    Object text = mock(String.class); // violation: pmd/MockedValueType
    Object copy = spy(new ArrayList<String>()); // violation: pmd/MockedValueType
    Object plain = spy(new Object());
    Runnable task = mock(Runnable.class);
    task.run();
    verify(task).run();
    assertEquals(0, values.size());
  }

  @Test
  void readsAnOptional() {
    assertEquals("ada", orEmpty(Optional.of("ada")));
  }

  private static String orEmpty(Optional<String> value) {
    return value.orElse("");
  }

  @Test
  void guardsItsData() {
    if (names.isEmpty()) {
      fail("no names loaded");
    }
    assertEquals(2, names.size());
  }

  @Test
  void equalsIsReflexive() {
    String name = names.get(0);
    assertEquals(name, name);
  }
}
