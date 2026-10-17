package shop;

final class SlowOrderService extends OrderService {
  @Override
  public boolean cancel(Status status) {
    try {
      Thread.sleep(1);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
    return super.cancel(status);
  }
}
