package route;

public class Handlers {
  public static void onA(String text) {
    System.out.println(text);
  }

  public static void onB(String text) {
    System.out.println(text.trim());
  }

  public static void over(int value) {
    System.out.println(value);
  }

  public static void over(String value) {
    System.out.println(value);
  }

  public void instance(String text) {
    System.out.println(text.length());
  }

  public static void pick(String text) {
    System.out.println(text);
  }

  public static void pick(String text, int times) {
    System.out.println(text.repeat(times));
  }

  public static void ping() {
    System.out.println("ping");
  }

  public static void ping(String text) {
    System.out.println(text);
  }

  public int size() {
    return 1;
  }

  public static int size(int width, int height) {
    return width * height;
  }
}
