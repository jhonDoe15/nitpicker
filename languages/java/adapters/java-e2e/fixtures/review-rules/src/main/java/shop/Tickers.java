package shop;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
public class Tickers {
  private final ScheduledExecutorService ticks = Executors.newSingleThreadScheduledExecutor(); // violation: SpringUnreleasedResource

  public ScheduledFuture<?> every(Runnable task) {
    return ticks.scheduleAtFixedRate(task, 1, 1, TimeUnit.SECONDS);
  }

  public static ExecutorService elastic() {
    return new ThreadPoolExecutor(0, Integer.MAX_VALUE, 60, TimeUnit.SECONDS, new SynchronousQueue<>()); // violation: UnboundedThreadPool
  }
}
