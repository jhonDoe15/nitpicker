package shop.lifecycle;

import jakarta.annotation.PreDestroy;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.util.Timer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

@Service
public class Released {
  private final ExecutorService workers = Executors.newFixedThreadPool(4);
  private final ExecutorService injected;
  private final Timer timer = new Timer("audit", true);
  private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
  private final HttpClient client = HttpClient.newHttpClient();

  public Released(ExecutorService injected) {
    this.injected = injected;
  }

  public void submit(Runnable task) {
    workers.execute(task);
    injected.execute(task);
    buffer.write(1);
    client.executor();
  }

  @PreDestroy
  void release() throws InterruptedException {
    workers.shutdown();
    if (!workers.awaitTermination(5, TimeUnit.SECONDS)) {
      workers.shutdownNow();
    }
    stopTimer();
  }

  private void stopTimer() {
    timer.cancel();
  }
}

@Component
class Disposable implements DisposableBean {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();

  void run(Runnable task) {
    pool.execute(task);
  }

  @Override
  public void destroy() {
    Shutdowns.shutdownQuietly(pool);
  }
}

@Component
class ClosingBean implements AutoCloseable {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();

  void run(Runnable task) {
    pool.execute(task);
  }

  @Override
  public void close() {
    pool.close();
  }
}

@Component
class Managed implements SmartLifecycle {
  private ExecutorService pool; // violation: SpringImmutableBeans
  private boolean running; // violation: SpringImmutableBeans

  @Override
  public void start() {
    pool = Executors.newSingleThreadExecutor();
    running = true;
  }

  @Override
  public void stop() {
    pool.shutdownNow();
    running = false;
  }

  @Override
  public boolean isRunning() {
    return running;
  }
}

@Component
class ClosedListener {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();

  void run(Runnable task) {
    pool.execute(task);
  }

  @EventListener(ContextClosedEvent.class)
  void closed() {
    pool.shutdown();
  }
}

@Configuration(proxyBeanMethods = false)
class PoolConfig {
  private final ExecutorService shared = Executors.newFixedThreadPool(2);

  @Bean
  ExecutorService sharedPool() {
    return shared;
  }

  @Bean(destroyMethod = "stop")
  Stoppable stoppable() {
    return new Stoppable();
  }
}

@Component
class Stoppable {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();

  void run(Runnable task) {
    pool.execute(task);
  }

  void stop() {
    pool.shutdown();
  }
}

@Component
class HelperRelease {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();

  void run(Runnable task) {
    pool.execute(task);
  }

  @PreDestroy
  void stop() {
    Shutdowns.gracefully(pool);
  }
}

final class Shutdowns {
  private Shutdowns() {
  }

  static void shutdownQuietly(ExecutorService pool) {
    pool.shutdownNow();
  }

  static void gracefully(ExecutorService pool) {
    pool.shutdown();
  }
}

class NotABean {
  private final ExecutorService pool = Executors.newSingleThreadExecutor();

  void run(Runnable task) {
    pool.execute(task);
  }
}
