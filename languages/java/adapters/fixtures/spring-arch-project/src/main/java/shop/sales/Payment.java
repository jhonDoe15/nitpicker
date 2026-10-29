package shop.sales;

public class Payment extends BaseEntity<Order, Ids.LineId> {
  private CartLine source;
}
