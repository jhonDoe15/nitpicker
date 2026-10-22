package shop.exception;

public class OrderNotFound extends RuntimeException {
  public OrderNotFound(Long id) {
    super("Order " + id);
  }
}
