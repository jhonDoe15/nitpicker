package shop.loading;

public class Starter {
  static final Starter DEFAULT = new Starter();
  private final Thread worker;
  private final long startedAt;

  public Starter() {
    worker = new Thread(Starter::idle);
    worker.start(); // violation: ClassLoadEffect
    startedAt = System.nanoTime();
  }

  private static void idle() {}

  Thread worker() {
    return worker;
  }

  long startedAt() {
    return startedAt;
  }
}
