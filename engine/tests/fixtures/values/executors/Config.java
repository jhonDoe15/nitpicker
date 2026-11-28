package values.executors;

import jakarta.annotation.PostConstruct;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.context.annotation.Bean;

public class Config {
  private ExecutorService warm;

  @Bean
  public ExecutorService workers() {
    ExecutorService pool = Executors.newFixedThreadPool(4);
    pool.submit(() -> 1);
    return pool;
  }

  @Bean
  public Runnable cleaner() {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    return () -> pool.submit(() -> 1);
  }

  @PostConstruct
  public void init() {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    pool.submit(() -> 1);
    warm = null;
  }
}
