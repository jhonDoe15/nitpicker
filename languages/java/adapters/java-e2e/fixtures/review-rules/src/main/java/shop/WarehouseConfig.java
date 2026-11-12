package shop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WarehouseConfig {
  private static final boolean LOCAL;

  static {
    LOCAL = Files.exists(Path.of("warehouse.local")); // violation: ClassLoadEffect
  }

  @Bean(destroyMethod = "shutdown")
  public ExecutorService warehouseWorkers() {
    return Executors.newFixedThreadPool(LOCAL ? 1 : 2);
  }
}
