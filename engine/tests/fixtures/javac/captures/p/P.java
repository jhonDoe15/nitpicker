package p;
public class P {
  String s = "f";
  void m(Object o) {
    if (o instanceof String s) { System.out.println(s); }
    Runnable r = () -> System.out.println(s);
  }
  void neg(Object o, int k) {
    if (!(o instanceof String s)) { return; }
    Runnable r = () -> System.out.println(s + k);
  }
  void loop(Object o) {
    while (!(o instanceof Integer s)) { o = 1; }
    Runnable r = () -> System.out.println(s);
  }
  void both(Object o) {
    if (o instanceof String s && s.length() > 1) { Runnable r = () -> System.out.println(s); }
    Runnable q = () -> System.out.println(s);
    Object x = switch (o) { case Integer s -> (Runnable) () -> System.out.println(s); default -> (Runnable) () -> System.out.println(s); };
  }
  void sw(int k, int j) {
    switch (k) {
      case 1: int t = 1; break;
      case 2: t = 2; int u = t; Runnable r = () -> System.out.println(u + j); break;
      default: t = 3; int v = t + 1; Runnable q = () -> System.out.println(v + j);
    }
  }
}
