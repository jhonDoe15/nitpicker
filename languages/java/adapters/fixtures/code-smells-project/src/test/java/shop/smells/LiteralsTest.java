package shop.smells;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Tag;
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
    assertEquals("shipped-order", shipped("shipped-order", 1));
    assertEquals("shipped-order", shipped("shipped-order", 2));
  }

  @Test
  @Tag("slow-suite")
  void firstTagged() {
    assertEquals(1, new Literals().rank("delivered"));
  }

  @Test
  @Tag("slow-suite")
  void secondTagged() {
    assertEquals(2, new Literals().rank("returned"));
  }

  @Test
  @Tag("slow-suite")
  void thirdTagged() {
    assertEquals(4, new Literals().other("delivered"));
  }

  @Test
  @Tag("slow-suite")
  void fourthTagged() {
    assertEquals(5, new Literals().other("returned"));
  }

  private String shipped(String value, int index) { // violation: UnusedFormalParameter
    return value;
  }
}
