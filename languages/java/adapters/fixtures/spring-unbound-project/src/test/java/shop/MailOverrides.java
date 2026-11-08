package shop;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(properties = {"shop.mail.host=localhost", "shop.mail.hots=localhost"})
@TestPropertySource(properties = "spring.datasource.passwrd=secret")
abstract class MailOverrides {
    static TestPropertyValues values() {
        return TestPropertyValues.of("server.port=0", "server.adress=::1");
    }

    static void register(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.urll", () -> "jdbc:h2:mem:test");
    }
}
