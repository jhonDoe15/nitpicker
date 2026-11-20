package guards;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@interface TestMethodProviders {
  String[] value() default {};
}

@TestMethodProviders("by-name")
class FoundByNameTest {
  public void testRunsByName() {
    assertEquals(3, "ada".length());
  }
}

class NamedTestsTest { // violation: pmd/TestClassWithoutTestCases
  public void testNeverRuns() { // violation: pmd/UnitTestShouldUseTestAnnotation
    assertEquals(3, "ada".length());
  }
}
