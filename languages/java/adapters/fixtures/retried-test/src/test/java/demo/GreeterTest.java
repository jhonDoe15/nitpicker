package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GreeterTest {
  @Test
  void greetsByName() {
    assertEquals("Hello, Ada", new Greeter().greet("Ada"));
  }

  @Test
  void passesOnlyOnItsSecondAttempt() throws IOException {
    Path marker = Path.of("first-attempt-ran");
    boolean ranBefore = Files.exists(marker);
    Files.writeString(marker, "ran");
    assertTrue(ranBefore, "first attempt");
  }
}
