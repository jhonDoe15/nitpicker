package shop;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.Timer;
import org.springframework.stereotype.Component;

@Component
public class TickerServer {
  private final Timer timer = new Timer("ticks", true);
  private final Engine engine = new Engine();

  @PostConstruct
  void start() {
    engine.start(); // violation: SpringStartupCleanup
  }

  @PreDestroy
  void stop() {
    timer.cancel();
    engine.stop();
  }

  static final class Engine {
    void start() {
    }

    void stop() {
    }
  }
}
