package demo.app;

final class GreeterBench {
  private GreeterBench() {}

  static void measure() throws InterruptedException {
    System.out.println("measure");
    Thread.sleep(1);
  }
}
