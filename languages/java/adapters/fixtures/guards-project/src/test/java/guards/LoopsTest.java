package guards;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LoopsTest {
  private static final List<String> NAMES = List.of("ada", "bob");

  @Test
  void checksEachInACallback() {
    NAMES.forEach(name -> assertEquals(3, name.length())); // violation: pmd/AssertionInControlFlow
  }

  @Test
  void checksEachInAStream() {
    NAMES.stream().map(name -> { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
      return name;
    }).count();
  }

  @Test
  void filtersBeforeAsserting() {
    IntStream.range(0, NAMES.size()).filter(index -> { // violation: pmd/AssertionInControlFlow
      assertEquals(3, NAMES.get(index).length());
      return true;
    }).count();
  }

  @Test
  void checksTheWholeList() {
    assertEquals(List.of(3, 3), NAMES.stream().map(String::length).toList());
  }

  @Test
  void checksEveryLengthTogether() {
    assertAll(
        () -> assertEquals(3, NAMES.get(0).length()),
        () -> assertEquals(3, NAMES.get(1).length()));
  }

  @Test
  void buildsDataBeforeTheAssertion() {
    List<Integer> lengths = NAMES.stream().map(name -> name.length() * 1).toList();
    assertEquals(List.of(3, 3), lengths);
  }

  @Test
  void checksInAHelper() {
    checkLengths(NAMES);
  }

  private static void checkLengths(List<String> names) {
    for (String name : names) { // violation: pmd/AssertionInControlFlow
      assertEquals(3, name.length());
    }
  }

  @Test
  void repeatsAFixedNumberOfTimes() {
    for (int attempt = 0; attempt < 3; attempt++) {
      assertEquals(2, NAMES.size());
    }
    IntStream.range(0, 3).forEach(attempt -> assertEquals(2, NAMES.size()));
    int index = 0;
    do {
      assertEquals(3, NAMES.get(index).length());
      index++;
    } while (index < NAMES.size());
  }

  @Test
  void checksOnlyWhenNotEmpty() {
    for (int attempt = 0; attempt < 3; attempt++) {
      if (!NAMES.isEmpty()) { // violation: pmd/AssertionInControlFlow
        assertEquals(2, NAMES.size());
      }
    }
  }

  @Test
  void callsAHelperWithoutLoops() {
    checkSize();
  }

  private static void checkSize() {
    assertEquals(2, NAMES.size());
  }

  @Test
  void filtersAFixedRange() {
    IntStream.range(0, 3).filter(index -> index > NAMES.size()).forEach(index -> { // violation: pmd/AssertionInControlFlow
      assertEquals(3, NAMES.get(index).length());
    });
    IntStream.range(0, 2).mapToObj(NAMES::get).forEach(name -> assertEquals(3, name.length()));
  }

  @Test
  void branchesInAHelper() {
    checkNonEmpty(NAMES);
  }

  private static void checkNonEmpty(List<String> names) {
    if (!names.isEmpty()) { // violation: pmd/AssertionInControlFlow
      assertEquals(2, names.size());
    }
  }

  @Test
  void branchesOnAHelperCondition() {
    if (retryable(NAMES)) {
      NAMES.size();
    }
    boolean valid = verifyLength(NAMES.get(0));
    assertEquals(true, valid);
  }

  private static boolean retryable(List<String> names) {
    return names.size() > 5;
  }

  private static boolean verifyLength(String name) {
    return name.length() == 3;
  }

  @ParameterizedTest
  @ValueSource(strings = {"ada", "bob"})
  void checksEachCase(String name) {
    assertEquals(3, name.length());
  }
}
