package shop;

import javax.naming.InitialContext;
import javax.naming.NamingException;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ShopApplication {
  public static void main(String[] args) {
    SpringApplication.run(ShopApplication.class, args);
  }

  static Object legacyDataSource() throws NamingException {
    return new InitialContext().lookup("java:comp/env/jdbc/legacy");
  }
}
