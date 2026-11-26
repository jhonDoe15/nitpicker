package e;

public class B4CharArray {
  String field = "abc";

  void m(String str, CharSequence cs, int[] arr) {
    for (char c : str.toCharArray()) {
      System.out.println(c);
    }
    for (char c : str.toCharArray()) System.out.println(c);
    for (char c : str.toCharArray()) {}
    for (char c : field.toCharArray()) {
      System.out.println(c);
    }
    for (char c : this.field.toCharArray()) {
      System.out.println(c);
    }
    for (char c : (str).toCharArray()) {
      System.out.println(c);
    }
    for (char c : str.toCharArray()) {
      int i = 0;
      System.out.println(c + i);
    }
    for (char c : str.toCharArray()) {
      System.out.println(c + i());
    }
    for (final char c : str.toCharArray()) {
      // leading comment
      System.out.println(c);
    }
    for (char c : cs.toString().toCharArray()) {
      System.out.println(c);
    }
    for (int x : arr) {
      System.out.println(x);
    }
    for (char c : "lit".toCharArray()) {
      System.out.println(c);
    }
    for (char c : str.toCharArray()) {
      Runnable r = () -> System.out.println(c);
    }
    for (char c : str.toCharArray()) {
      for (int i = 0; i < 2; i++) {
        System.out.println(c);
      }
    }
  }

  int i() {
    return 0;
  }

  @SuppressWarnings("LoopOverCharArray")
  void s(String str) {
    for (char c : str.toCharArray()) {
      System.out.println(c);
    }
  }
}
