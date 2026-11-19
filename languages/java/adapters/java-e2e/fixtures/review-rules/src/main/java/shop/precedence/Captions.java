package shop.precedence;

public class Captions {
  private final String owner;
  private final String error;

  public Captions(String owner, String error) {
    this.owner = owner;
    this.error = error;
  }

  public String banned(String x, String a, Object client) {
    String first = "a" + x != null ? x : "n"; // violation: ConcatenationComparedWithNull
    String second = a + "b" == null ? "d" : a; // violation: ConcatenationComparedWithNull
    String third = "handle(client=" + client != null ? client.toString() : "null" + ", error=" + error; // violation: ConcatenationComparedWithNull
    String fourth = owner + " -> " + error == null ? " " : error; // violation: ConcatenationComparedWithNull
    return first + second + third + fourth;
  }

  public String allowed(String x, String a, Object client, int total, int limit) {
    String first = "a" + (x != null ? x : "n");
    String second = x != null ? "a" + x : "n";
    String third = "handle(client=" + (client != null ? client.toString() : "null") + ", error=" + error;
    String fourth = a == null ? "d" : a + "b";
    boolean sum = total + 1 != limit;
    boolean same = ("a" + x) != null;
    boolean call = String.valueOf(x + 1).length() + 1 != limit;
    return first + second + third + fourth + sum + same + call;
  }
}
