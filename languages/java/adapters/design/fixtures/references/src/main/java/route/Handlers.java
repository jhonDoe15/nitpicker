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
}
