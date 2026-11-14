package shop.lifecycles;

import java.util.Timer;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public final class Pollers implements AutoCloseable {
  private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(); // violation: TimerNotStoppedOnClose
  private final Timer timer = new Timer(true);
  private final ScheduledExecutorService guarded = Executors.newSingleThreadScheduledExecutor();
  private final ScheduledExecutorService stopped = Executors.newSingleThreadScheduledExecutor();

  public void start() {
    scheduler.scheduleAtFixedRate(() -> {}, 1, 1, TimeUnit.SECONDS);
    stopped.scheduleAtFixedRate(() -> {}, 1, 1, TimeUnit.SECONDS);
  }

  private static void stopQuietly(ScheduledExecutorService executor) {
    executor.shutdownNow();
  }

  @Override
  public void close() {
    timer.cancel();
    stopped.shutdownNow();
    stopQuietly(guarded);
  }
}
