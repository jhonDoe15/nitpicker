package shop.injection;

import java.time.Clock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class Constructors {
  private final Clock clock;

  @Autowired
  Constructors(Clock clock) {
    this.clock = clock;
  }

  @Autowired // violation: SpringConstructorInjection
  void setBackup(Clock backup) {}

  long now() {
    return clock.millis();
  }
}
