package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

@TestMethodOrder(MethodOrderer.Random.class)
class ShuffledTest {
  @Test
  void countsNames() {
    assertEquals(2, List.of("ada", "bob").size());
  }
}
