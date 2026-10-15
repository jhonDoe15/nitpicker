package shop.smells;

public final class Literals {
  private static final String SHIPPED = "shipped";

  public String label(String status) {
    String first = "pending order";
    String second = "pending order";
    String third = "pending order"; // violation: RepeatedStringLiteral
    return first + second + third + status;
  }

  public int rank(String status) {
    return switch (status) {
      case "delivered" -> 1;
      case "returned" -> 2;
      default -> SHIPPED.equals(status) ? 3 : 0;
    };
  }

  public int other(String status) {
    return switch (status) {
      case "delivered" -> 4;
      case "returned" -> 5;
      default -> "ab".equals(status) || "ab".isEmpty() || "ab".isBlank() ? 6 : 0;
    };
  }
}
