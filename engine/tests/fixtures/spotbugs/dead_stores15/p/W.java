package p;
public class W {
  int f, g; long lg; double dg; static int sf; int z = 2; long lz = 2; int[] arr = new int[1]; Object o = "s"; Integer bz = 1; String s; boolean b; Runnable r; Class<?> c; W other;
  static int num() { return 3; }
  void use(Object x) {}
  void t00_getstatic() {
    int x = num();
    use(x);
    try {
      x = num();
      g = sf;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t01_getfield() {
    int x = num();
    use(x);
    try {
      x = num();
      g = f;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t02_getfieldother() {
    int x = num();
    use(x);
    try {
      x = num();
      g = other.f;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t03_idiv() {
    int x = num();
    use(x);
    try {
      x = num();
      g = 5 / z;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t04_irem() {
    int x = num();
    use(x);
    try {
      x = num();
      g = z % 3;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t05_ldiv() {
    int x = num();
    use(x);
    try {
      x = num();
      lg = 5L / lz;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t06_ddiv() {
    int x = num();
    use(x);
    try {
      x = num();
      dg = 5.0 / z;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t07_iastore() {
    int x = num();
    use(x);
    try {
      x = num();
      arr[0] = 1;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t08_iaload() {
    int x = num();
    use(x);
    try {
      x = num();
      g = arr[0];
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t09_indy() {
    int x = num();
    use(x);
    try {
      x = num();
      s = "a" + z;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t10_checkcast() {
    int x = num();
    use(x);
    try {
      x = num();
      s = (String) o;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t11_boxing() {
    int x = num();
    use(x);
    try {
      x = num();
      bz = z;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t12_unboxing() {
    int x = num();
    use(x);
    try {
      x = num();
      g = bz;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t13_newarray() {
    int x = num();
    use(x);
    try {
      x = num();
      arr = new int[z];
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t14_new() {
    int x = num();
    use(x);
    try {
      x = num();
      o = new Object();
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t15_putfield() {
    int x = num();
    use(x);
    try {
      x = num();
      this.f = 3;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t16_putstatic() {
    int x = num();
    use(x);
    try {
      x = num();
      sf = 3;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t17_arraylength() {
    int x = num();
    use(x);
    try {
      x = num();
      g = arr.length;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t18_instanceof() {
    int x = num();
    use(x);
    try {
      x = num();
      b = o instanceof String;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t19_lambda() {
    int x = num();
    use(x);
    try {
      x = num();
      r = () -> {};
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t20_mref() {
    int x = num();
    use(x);
    try {
      x = num();
      r = this::toString;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t21_iadd() {
    int x = num();
    use(x);
    try {
      x = num();
      g = z + 1;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t22_constidiv() {
    int x = num();
    use(x);
    try {
      x = num();
      g = z / 2;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t23_ldcclass() {
    int x = num();
    use(x);
    try {
      x = num();
      c = String.class;
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t24_sync() {
    int x = num();
    use(x);
    try {
      x = num();
      synchronized (this) { g = 1; }
    } catch (RuntimeException e) {
      use(x);
    }
  }
  void t25_throwstmt() {
    int x = num();
    use(x);
    try {
      x = num();
      if (z > 5) throw new IllegalStateException();
    } catch (RuntimeException e) {
      use(x);
    }
  }
}
