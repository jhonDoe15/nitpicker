package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ResetListTest {
  static final List<String> SEEN = new ArrayList<>();
  static final List<String> KEPT = new ArrayList<>(); // violation: pmd/MutableStaticCollection

  @BeforeEach
  void reset() {
    SEEN.clear();
  }

  @Test
  void recordsOnce() {
    SEEN.add("ada");
    KEPT.add("ada");
    assertEquals(1, SEEN.size());
  }
}
