import org.junit.Assert;

abstract class ErrorProneTest {
  static void assertEquals(Object expected, Object actual) {}

  static void assertEquals(String message, Object expected, Object actual) {}

  static void assertEquals(double expected, double actual, double delta) {}

  static void assertTrue(boolean actual, boolean other) {}

  void assertEqualsInstance(Object expected, Object actual) {}

  enum MyEnum {
    VALUE
  }

  abstract Object get();

  abstract MyEnum enumValue();

  void same(Object expected, Object actual) {
    assertEquals(expected, actual);
    assertEquals("", expected, actual);
  }

  void swapped(Object expected, Object actual) {
    assertEquals(actual, expected);
  }

  void swappedMessage(Object expected, Object actual) {
    assertEquals("", actual, expected);
  }

  void prefix(Object expectedValue) {
    assertEquals(get(), expectedValue);
  }

  void literalActual(Object other) {
    assertEquals(other, 1);
  }

  void literalExpected(Object other) {
    assertEquals("", 1, other);
  }

  void bothLiterals() {
    assertEquals(2, 1);
  }

  void duplicate(Object expected, Object actual) {
    assertEquals(expected, actual);
    assertEquals(actual, expected);
  }

  void nothing(Object other1, Object other2) {
    assertEquals(other1, other2);
  }

  void throwable(Exception exception) {
    try {
      throw exception;
    } catch (Exception expected) {
      assertEquals(exception, expected);
    }
  }

  void enumMember(MyEnum expected) {
    assertEquals(MyEnum.VALUE, expected);
  }

  void enumReturned(Object other) {
    assertEquals(other, enumValue());
  }

  void commented(Object expected, Object actual) {
    assertEquals(/* expected= */ actual, /* actual= */ expected);
  }

  void junit(Object expected, Object actual) {
    Assert.assertEquals(actual, expected);
    Assert.assertEquals("m", actual, expected);
    Assert.assertEquals(expected, actual);
    Assert.assertEquals(1L, 2L);
  }

  void other(Object expected, Object actual) {
    assertEqualsInstance(actual, expected);
    assertEquals(1.0, 2.0, 0.5);
    assertTrue(true, false);
  }

  void prefixes(Object expectedA, Object actualB, Object actualC) {
    assertEquals(actualB, expectedA);
    assertEquals(actualC, actualB);
    assertEquals(expectedA, expectedA);
  }

  void fields(ErrorProneTest t, Object actualThing) {
    assertEquals(actualThing, t.get());
    assertEquals(t.get(), actualThing);
    assertEquals(actualThing, MyEnum.VALUE);
    assertEquals(MyEnum.VALUE, actualThing);
    assertEquals("x", actualThing);
    assertEquals(actualThing, "x");
    assertEquals(null, actualThing);
    assertEquals(actualThing, null);
  }

  void nulls(Object other) {
    assertEquals(null, 1.0);
    assertEquals(null, "x");
    assertEquals((String) null, "x");
    assertEquals((Object) null, MyEnum.VALUE);
    assertEquals(null, other);
    assertEquals("", null, 1.0);
    assertEquals(other, "x");
  }

  @SuppressWarnings("AssertEqualsArgumentOrderChecker")
  void suppressed(Object expected, Object actual) {
    assertEquals(actual, expected);
  }
}
