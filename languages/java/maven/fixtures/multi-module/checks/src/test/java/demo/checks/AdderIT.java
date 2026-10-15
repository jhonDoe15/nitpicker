package demo.checks;

import static org.junit.jupiter.api.Assertions.assertEquals;

import demo.core.Adder;
import org.junit.jupiter.api.Test;

class AdderIT {
  @Test
  void addsAcrossModules() {
    assertEquals(5, new Adder().add(2, 3));
  }
}
