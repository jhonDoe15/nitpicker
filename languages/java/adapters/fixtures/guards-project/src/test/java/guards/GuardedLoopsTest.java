package guards;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuardedLoopsTest {
  private static final List<String> NAMES = List.of("ada", "bob");
  private static final List<String> NONE = NAMES.subList(0, 0);

  @Test
  void loopsOverFixedValues() {
    for (String name : List.of("ada", "bob")) {
      assertEquals(3, name.length());
    }
    for (String name : Arrays.asList("ada", "bob")) {
      assertEquals(3, name.length());
    }
    for (String name : new String[] {"ada", "bob"}) {
      assertEquals(3, name.length());
    }
    List.of("ada", "bob").forEach(name -> assertEquals(3, name.length()));
  }

  @Test
  void loopsOverAnEmptyLiteral() {
    for (Object name : List.of()) { // violation: pmd/AssertionInControlFlow
      assertEquals("ada", name);
    }
  }

  @Test
  void assertsTheSizeFirst() {
    List<String> names = NAMES;
    assertEquals(2, names.size());
    for (String name : names) {
      assertEquals(3, name.length());
    }
    names.forEach(name -> assertEquals(3, name.length()));
  }

  @Test
  void assertsNotEmptyFirst() {
    List<String> names = NAMES;
    assertFalse(names.isEmpty());
    for (String name : names) {
      assertEquals(3, name.length());
    }
    List<String> others = NAMES;
    assertThat(others).hasSize(2);
    for (String name : others) {
      assertEquals(3, name.length());
    }
  }

  @Test
  void assertsAnEmptySizeFirst() {
    List<String> names = NONE;
    assertEquals(0, names.size());
    for (String name : names) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
    }
  }

  @Test
  void wrapsAnArrayThatMayBeEmpty() {
    String[] names = NAMES.toArray(new String[0]);
    for (String name : Arrays.asList(names)) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
    }
  }

  @Test
  void assertsAnotherSizeFirst() {
    List<String> names = NAMES;
    List<String> others = NAMES;
    assertEquals(2, others.size());
    for (String name : names) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
    }
  }

  @Test
  void assertsTheSizeAfterwards() {
    List<String> names = NONE;
    for (String name : names) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
    }
    assertTrue(names.isEmpty());
  }

  @Test
  void assertsAFoundFlagAfterTheLoop() {
    boolean found = false;
    for (String name : NAMES) {
      assertEquals(3, name.length());
      found |= name.equals("ada");
    }
    assertTrue(found);
  }

  @Test
  void countsWithoutAssertingTheCount() {
    int count = 0;
    for (String name : NAMES) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
      count++;
    }
    assertEquals(2, NAMES.size());
  }

  @Test
  void assertsInBothBranches() {
    if (NAMES.size() > 1) {
      assertEquals("ada", NAMES.get(0));
    } else {
      assertEquals(0, NAMES.size());
    }
  }

  @Test
  void assertsInOneBranchOnly() {
    if (NAMES.size() > 1) { // violation: pmd/AssertionInControlFlow
      assertEquals("ada", NAMES.get(0));
    } else {
      NAMES.size();
    }
  }

  @Test
  void assertsInTwoOfThreeBranches() {
    if (NAMES.size() > 1) { // violation: pmd/AssertionInControlFlow
      assertEquals("ada", NAMES.get(0));
    } else if (NAMES.isEmpty()) {
      assertEquals(0, NAMES.size());
    }
  }
}
