package p;
public class M {
  int f;
  static int num() { return 3; }
  void use(Object o) {}
  void a00() {
    long x = 10000L;
    use(1);
    x = 10000L;
  }
  void b00() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    long x = 10000L;
    use(1);
  }
  void c00() {
    if (f > 0) {
      long a = 10000L;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a01() {
    long x = 0L;
    use(1);
    x = 0L;
  }
  void b01() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    long x = 0L;
    use(1);
  }
  void c01() {
    if (f > 0) {
      long a = 0L;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a02() {
    double x = 2.5;
    use(1);
    x = 2.5;
  }
  void b02() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    double x = 2.5;
    use(1);
  }
  void c02() {
    if (f > 0) {
      double a = 2.5;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a03() {
    double x = 1.0;
    use(1);
    x = 1.0;
  }
  void b03() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    double x = 1.0;
    use(1);
  }
  void c03() {
    if (f > 0) {
      double a = 1.0;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a04() {
    int x = 100000;
    use(1);
    x = 100000;
  }
  void b04() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    int x = 100000;
    use(1);
  }
  void c04() {
    if (f > 0) {
      int a = 100000;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a05() {
    int x = 5;
    use(1);
    x = 5;
  }
  void b05() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    int x = 5;
    use(1);
  }
  void c05() {
    if (f > 0) {
      int a = 5;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a06() {
    String x = "abc";
    use(1);
    x = "abc";
  }
  void b06() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    String x = "abc";
    use(1);
  }
  void c06() {
    if (f > 0) {
      String a = "abc";
      use(1);
    }
    int x = num();
    use(x);
  }
  void a07() {
    float x = 2.5f;
    use(1);
    x = 2.5f;
  }
  void b07() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    float x = 2.5f;
    use(1);
  }
  void c07() {
    if (f > 0) {
      float a = 2.5f;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a08() {
    float x = 2f;
    use(1);
    x = 2f;
  }
  void b08() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    float x = 2f;
    use(1);
  }
  void c08() {
    if (f > 0) {
      float a = 2f;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a09() {
    Object x = null;
    use(1);
    x = null;
  }
  void b09() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    Object x = null;
    use(1);
  }
  void c09() {
    if (f > 0) {
      Object a = null;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a10() {
    long x = 2L;
    use(1);
    x = 2L;
  }
  void b10() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    long x = 2L;
    use(1);
  }
  void c10() {
    if (f > 0) {
      long a = 2L;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a11() {
    short x = 300;
    use(1);
    x = 300;
  }
  void b11() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    short x = 300;
    use(1);
  }
  void c11() {
    if (f > 0) {
      short a = 300;
      use(1);
    }
    int x = num();
    use(x);
  }
  void a12() {
    double x = 2.0;
    use(1);
    x = 2.0;
  }
  void b12() {
    if (f > 0) {
      int a = num();
      use(a);
    }
    double x = 2.0;
    use(1);
  }
  void c12() {
    if (f > 0) {
      double a = 2.0;
      use(1);
    }
    int x = num();
    use(x);
  }
}
