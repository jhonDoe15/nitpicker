package shop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Callable;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ShopApplication {
  private static final boolean LOCAL = Files.exists(Path.of("application-local.yml"));

  public static void main(String[] args) {
    if (LOCAL) {
      System.setProperty("spring.profiles.active", "local");
    }
    SpringApplication.run(ShopApplication.class, args);
  }

  @Bean
  Callable<Object> legacyDataSource() {
    return () -> new InitialContext().lookup("java:comp/env/jdbc/legacy");
  }

  static Object auditSource() throws NamingException {
    return new InitialContext().lookup("java:comp/env/jdbc/audit"); // violation: ServiceLocatorLookup
  }
}
