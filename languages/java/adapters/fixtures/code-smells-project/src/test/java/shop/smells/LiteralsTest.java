package shop.smells;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class LiteralsTest {
  @Test
  void labelsThreeOrders() {
    String expected = "pending orderpending orderpending orderx";
    assertEquals(expected, new Literals().label("x"));
    assertEquals(expected.length(), new Literals().label("x").length());
  }

  @Test
  void repeatsAnExpectedValue() {
    assertEquals("shipped-order", shipped("shipped-order", 1)); // violation: AvoidDuplicateLiterals
    assertEquals("shipped-order", shipped("shipped-order", 2));
  }

  private String shipped(String value, int index) { // violation: UnusedFormalParameter
    return value;
  }
}
