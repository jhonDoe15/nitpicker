package shop.smells;

public final class Literals {
  private static final String SHIPPED = "shipped";
  private static final String REFUNDED = "refunded";

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

  public String titles(java.util.ResourceBundle messages) {
    String title = messages.getString("orders.title") + messages.getString("orders.title");
    return title + messages.getString("orders.title");
  }

  public String keys(java.util.Properties properties) {
    String first = properties.getProperty("orders.footer") + properties.getProperty("orders.footer");
    return first + properties.getProperty("orders.footer"); // violation: RepeatedStringLiteral
  }

  public java.util.List<java.util.Map<String, String>> events(java.util.Map<String, String> last) {
    last.put("kind", "order-placed");
    last.put("customer", "first");
    return java.util.List.of(
        java.util.Map.of("type", "order-placed", "customer", "second"),
        java.util.Map.of("type", "order-placed", "customer", "third"),
        last);
  }

  public String formats(java.util.Map<String, String> headers) {
    headers.put("Accept", "application/json");
    headers.put("Content-Type", "application/json");
    headers.put("X-Format", "application/json");
    String date = "%Y-%m-%d" + "%Y-%m-%d" + "%Y-%m-%d";
    String method = "DELETE" + "DELETE" + "DELETE";
    String day = "2024-01-01" + "2024-01-01";
    return date + method + day + "2024-01-01"; // violation: RepeatedStringLiteral
  }

  public String translated() {
    return t("orders.heading") + t("orders.heading") + t("orders.heading");
  }

  public String refunds() {
    return "refunded".trim() + "refunded".strip(); // violation: RepeatedStringLiteral
  }

  private static String t(String key) {
    return key + REFUNDED;
  }
}
