package e;

import java.awt.color.ICC_Profile;
import java.io.IOException;

public class S17Main {
  static class Good {
    public static void main(String[] args) {}
  }

  static class Varargs {
    public static void main(String... args) {}
  }

  static class WrongName {
    static void spain(String[] args) {}
  }

  interface InterfaceMain {
    static void main(String[] args) {}
  }

  static class WrongParameters {
    static void main(String[][] args) {}

    void main(Object[] args) {}

    void main() {}

    void main(String[] args, int more) {}

    void main(String args) {}

    void main(java.util.List<String> args) {}

    <T extends String> void main(T[] args) {}
  }

  static class NonPublic {
    static void main(String[] args) {}
  }

  static class NonStatic {
    public void main(String[] args) {}
  }

  static class Neither {
    void main(String[] args) {}
  }

  static class Private {
    private static void main(String[] args) {}
  }

  static class PrivateNonStatic {
    private void main(String... args) {}
  }

  static class Protected {
    protected static int main(String[] args) {
      return 0;
    }
  }

  static class WrongReturn {
    public static int main(String[] args) {
      return 0;
    }

    public static String main(String[] args, int x) {
      return "";
    }
  }

  static class Finals {
    final void main(String[] args) {}

    public final void main(String[] args, int x) {}

    static final void main(String[] a, long x) {}

    @Deprecated
    synchronized void main(String[] a, short x) {}

    @Deprecated
    /* comment */ void main(String[] a, char x) {}
  }

  static class Generic {
    public static <T> void main(String[] args) {}

    static <T> void main(String[] args, int x) {}

    <T> int main(String[] args, long x) {
      return 0;
    }
  }

  interface Abstract {
    void main(String[] args);

    default void main(String[] args, int x) {}
  }

  enum Constants {
    ONE;

    void main(String[] args) {}
  }

  @interface Annotation {}

  static class Suppressed {
    @SuppressWarnings("IncorrectMainMethod")
    void main(String[] args) {}
  }

  void loops(int n, int[] array, java.util.List<String> list) {
    for (int i = 0; i < 10; i++) {
      i++;
    }
    for (int i = 0; i < 10; i++) {
      i--;
    }
    for (int i = 0; i < 10; i++) {
      --i;
    }
    for (int i = 0; i < 10; i++) {
      --i;
      int a = 0;
    }
    for (int i = 0, a = 1; i < 10; i++, a++) {
      a++;
    }
    for (int i = 0, a = 1; i < 10; i++, a++) {
      i++;
    }
    for (int i = 0, a = 1; i < 10; i++, a++) {
      a++;
      i++;
    }
    for (int i = 0; i < 10; i++) {
      for (int a = 0; a < 10; a++) {
        a--;
      }
    }
    for (int i = 0; i < 10; i++) {
      i++;
      for (int a = 0; a < 10; a++) {
        a--;
      }
    }
    for (int i = 0; i < 10; i++) i++;
    for (int[] level = {}; level[0] > 10; level[0]--) {
      System.out.println("test");
    }
    for (int i = 0; i < 2; i++) {}
    for (int i = 0; i < 20; i++) {
      if (i == 7) {
        i++;
      }
    }
    for (int i = 0; i < 20; i++) {
      while (i == 7) {
        i++;
      }
    }
    for (int i = 0; i < 20; i++) {
      do {
        i++;
      } while (i == 7);
    }
    for (int i = 0; i < 20; i++) {
      for (int a = 0; a < i; a++) {
        i++;
      }
    }
    for (int i = 0; i < 10; i++) {
      for (String s : list) {
        i++;
      }
    }
    for (int i = 0; i < 2; i++) {
      int a = 0;
      a++;
    }
    for (int i = 0; i < 2; i++) {
      n++;
    }
    for (n = 0; n < 2; n++) {
      n++;
    }
    for (int i = 0; i < 2; i++) {
      (i)++;
    }
    for (int i = 0; i < 2; i += 1) {
      i++;
    }
    for (int i = 0; i < 2; i++) {
      i += 1;
    }
    for (int i = 0; i < 2; i++) {
      {
        i++;
      }
    }
    for (int i = 0; i < 2; i++) {
      array[i]++;
    }
    for (int i = 0; i < 2; array[i]++) {
      array[i]++;
    }
    for (int i = 0; i < 2; this.field++) {
      this.field++;
    }
    for (int i = 0; i < 2; field++) {
      this.field--;
    }
    for (int i = 0; i < 2; other.field++) {
      field--;
    }
    for (int i = 0; i < 2; i++) {
      int i2 = i;
      Runnable runnable = () -> field++;
    }
    for (int i = 0; i < 10; i++) {
      for (int j = 0; j < 10; j++) {
        i++;
      }
      j: for (; ; ) {
        break j;
      }
    }
  }

  @SuppressWarnings("IncrementInForLoopAndHeader")
  void suppressedLoop() {
    for (int i = 0; i < 10; i++) {
      i++;
    }
  }

  int field;
  S17Main other;

  void icc(String name, byte[] bytes, java.io.InputStream stream) throws IOException {
    ICC_Profile a = ICC_Profile.getInstance("file.icc");
    ICC_Profile b = ICC_Profile.getInstance(name);
    ICC_Profile c = ICC_Profile.getInstance(name + ".icc");
    ICC_Profile d = ICC_Profile.getInstance(bytes);
    ICC_Profile e = ICC_Profile.getInstance(stream);
    ICC_Profile f = ICC_Profile.getInstance(ICC_Profile.icSigXYZData);
  }

  @SuppressWarnings("ICCProfileGetInstance")
  ICC_Profile suppressedIcc(String name) throws IOException {
    return ICC_Profile.getInstance(name);
  }

  double floats(int i, long l, float f, double d, short s, Integer boxed) {
    double a = Math.scalb(i, 2);
    double b = Math.scalb(f, 2);
    double c = Math.scalb(d, 2);
    double e = Math.scalb(l, 2);
    double g = Math.scalb(s, 2);
    double h = Math.scalb(boxed, 2);
    float j = Math.scalb(i, 2);
    float k = (float) Math.scalb(i, 2);
    Object o = Math.scalb(i, 2);
    double m = Math.scalb(i + 1, 2) + 1.0;
    double n = 1 + Math.scalb(i * 2, 2);
    long p = (long) Math.scalb(i, 2);
    double q = Math.scalb((i), 2);
    double r = Math.scalb(Integer.parseInt("1"), 2);
    double t = Math.scalb(i, i);
    takesDouble(Math.scalb(i, 2));
    takesFloat(Math.scalb(i, 2));
    double u = (Math.scalb(i, 2));
    return Math.scalb(i, 2);
  }

  float floatReturn(int i) {
    return Math.scalb(i, 2);
  }

  @SuppressWarnings("IntFloatConversion")
  double suppressedFloat(int i) {
    return Math.scalb(i, 2);
  }

  void takesDouble(double d) {}

  void takesFloat(float f) {}
}
