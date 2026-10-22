package demo.app;

final class GreeterRun {
  private GreeterRun() {}

  static void run() {
    System.out.println("run");
  }

  static void pause() throws InterruptedException {
    Thread.sleep(1);
  }
}
