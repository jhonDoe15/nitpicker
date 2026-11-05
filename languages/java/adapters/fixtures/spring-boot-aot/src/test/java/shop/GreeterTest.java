package shop;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class GreeterTest {
    @Autowired
    private Greeter greeter;

    @Test
    void greetsByName() {
        assertThat(greeter.greet("Ada")).isEqualTo("Hello, Ada");
    }
}
