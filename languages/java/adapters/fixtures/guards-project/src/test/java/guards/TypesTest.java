package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class TypesTest {
  @Test
  @SuppressWarnings({"rawtypes", "unchecked", "cast"})
  void readsUntypedNames() {
    List names = new ArrayList(); // violation: javac/rawtypes, javac/rawtypes
    names.add("ada"); // violation: javac/unchecked
    List<String> typed = (List<String>) names; // violation: javac/unchecked
    assertEquals("ada", (String) typed.get(0)); // violation: javac/cast
  }
}
