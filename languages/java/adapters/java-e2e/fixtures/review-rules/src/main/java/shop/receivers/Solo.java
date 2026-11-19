package shop.receivers;

public final class Solo {
  private Solo() {}

  public static void alone(Chain only) {
    only.attach(only);
  }
}
