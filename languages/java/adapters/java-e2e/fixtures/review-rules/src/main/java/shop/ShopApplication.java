package shop;

import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ShopApplication {
  private static final boolean LOCAL = Files.exists(Path.of("application-local.yml"));

  public static void main(String[] args) {
    if (LOCAL) {
      System.setProperty("spring.profiles.active", "local");
    }
    SpringApplication.run(ShopApplication.class, args);
  }
}
