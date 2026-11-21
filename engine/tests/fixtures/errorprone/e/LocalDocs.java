package e;

class LocalDocs {
  /**/ /** x */ int twoA;
  /** a */ /**/ int twoB;
  /***/ int stars;
  /**/ /* @return x */ int almostEmpty;
  /***/ /* @return x */ int almostStars;
  /// line @return x
  /// second
  int markdown;
  /** doc */ // @return x */
  int afterDoc;

  void body() {
    /** A. */
    class A {}
    /** B. */
    final class B {}
    /** C. */
    class C { C() {} }
    /** D. */
    interface D {}
    /** E. */
    enum E { X }
    /** F. */
    record F(int a) {}
    /** G. */
    @Deprecated class G {}
    /** H. */
    @Deprecated final class H { H() {} }
    /** R1. */
    record R1(int a) { R1(int a) { this.a = a; } }
    /** R2. */
    record R2(int a) { R2 { System.out.println(a); } }
    R2 two = new R2(1);
    /** R3. */
    record R3(int a) { R3() { this(1); } }
    /** R4. */
    record R4(java.util.List<String> a) { R4(java.util.List<String> a) { this.a = a; } }
    /** E2. */
    enum E2 { X; E2() {} }
  }

  Object o = new Object() {
    /** J. */
    class J {}
    /** K. */
    int k;
  };
}
