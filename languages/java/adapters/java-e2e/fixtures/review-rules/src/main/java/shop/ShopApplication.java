package shop;

import java.util.concurrent.Callable;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ShopApplication {
  public static void main(String[] args) {
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
