package p;
import java.io.*;
public class V {
  int f; static int sf; int z = 2; long lz = 2; int[] arr = new int[1]; Object o = "s"; Integer bz = 1;
  static int num() { return 3; }
  void use(Object x) {}
  static void io() throws IOException {}
  void t00_getstatic() {
    int x = num();
    try {
      x = num();
      int y = sf;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t01_getfield() {
    int x = num();
    try {
      x = num();
      int y = f;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t02_idiv() {
    int x = num();
    try {
      x = num();
      int y = 5 / z;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t03_irem() {
    int x = num();
    try {
      x = num();
      int y = z % 3;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t04_ldiv() {
    int x = num();
    try {
      x = num();
      long y = 5L / lz;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t05_ddiv() {
    int x = num();
    try {
      x = num();
      double y = 5.0 / z;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t06_iastore() {
    int x = num();
    try {
      x = num();
      arr[0] = 1;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t07_iaload() {
    int x = num();
    try {
      x = num();
      int y = arr[0];
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t08_indy() {
    int x = num();
    try {
      x = num();
      String y = "a" + z;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t09_checkcast() {
    int x = num();
    try {
      x = num();
      String y = (String) o;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t10_boxing() {
    int x = num();
    try {
      x = num();
      Integer y = z;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t11_unboxing() {
    int x = num();
    try {
      x = num();
      int y = bz;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t12_newarray() {
    int x = num();
    try {
      x = num();
      int[] y = new int[z];
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t13_new() {
    int x = num();
    try {
      x = num();
      Object y = new Object();
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t14_putfield() {
    int x = num();
    try {
      x = num();
      this.f = 3;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t15_putstatic() {
    int x = num();
    try {
      x = num();
      sf = 3;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t16_arraylength() {
    int x = num();
    try {
      x = num();
      int y = arr.length;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t17_instanceof() {
    int x = num();
    try {
      x = num();
      boolean y = o instanceof String;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t18_lambda() {
    int x = num();
    try {
      x = num();
      Runnable y = () -> {};
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t19_mref() {
    int x = num();
    try {
      x = num();
      Runnable y = this::toString;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t20_iadd() {
    int x = num();
    try {
      x = num();
      int y = z + 1;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t21_constidiv() {
    int x = num();
    try {
      x = num();
      int y = z / 2;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t22_local() {
    int x = num();
    try {
      x = num();
      int y = z;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t23_ldcclass() {
    int x = num();
    try {
      x = num();
      Class<?> y = String.class;
      use(1);
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void c1() {
    int x = num();
    try {
      x = num();
      x = num();
      io();
    } catch (IOException e) {
      use(x);
    }
  }
  void c2() {
    int x = num();
    try {
      x = num();
      use(2);
      io();
    } catch (IOException e) {
      use(x);
    }
  }
  void c3() {
    int x = num();
    try {
      x = num();
      int y = f;
      io();
    } catch (IOException e) {
      use(x);
    }
  }
  void c4() {
    int x = num();
    try {
      x = num();
      int y = f;
      use(2);
    } catch (Exception e) {
      use(x);
    }
  }
  void c5() {
    int x = num();
    try {
      x = num();
      int y = f;
      use(2);
    } catch (Error e) {
      use(x);
    }
  }
}
