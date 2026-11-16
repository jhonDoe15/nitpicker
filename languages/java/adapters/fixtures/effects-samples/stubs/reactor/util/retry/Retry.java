package reactor.util.retry;

import java.util.function.Predicate;

public abstract class Retry {
  public static Retry max(long attempts) {
    return null;
  }

  public Retry filter(Predicate<Throwable> predicate) {
    return this;
  }
}
