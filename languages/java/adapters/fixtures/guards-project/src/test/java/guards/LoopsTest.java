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

  @ParameterizedTest
  @ValueSource(strings = {"ada", "bob"})
  void checksEachCase(String name) {
    assertEquals(3, name.length());
  }
}
