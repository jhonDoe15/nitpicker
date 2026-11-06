package shop;

import jakarta.annotation.PostConstruct;
import java.util.Timer;
import org.springframework.stereotype.Component;

@Component
public class TickerServer {
  private final Timer timer = new Timer("ticks", true); // violation: SpringUnreleasedResource
  private final Engine engine = new Engine();

  @PostConstruct
  void start() {
    engine.start(); // violation: SpringStartupCleanup
  }

  static final class Engine {
    void start() {
    }
  }
}
