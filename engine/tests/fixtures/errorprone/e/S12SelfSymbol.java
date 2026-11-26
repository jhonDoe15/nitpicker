package e;

import com.google.common.base.Objects;
import java.util.function.Function;

class S12SelfSymbol {
  String s = "";
  static String t = "";
  S12SelfSymbol other;
  int[] arr = new int[1];
  int[] brr = new int[1];

  boolean shadowedParameter(String s) {
    return this.s.equals(s);
  }

  boolean shadowedParameterReversed(String s) {
    return s.equals(this.s);
  }

  boolean shadowedSame(String s) {
    return s.equals(s);
  }

  boolean shadowedThisSame(String s) {
    return this.s.equals(this.s);
  }

  boolean fieldMixed() {
    return this.s.equals(s);
  }

  boolean receivers(S12SelfSymbol o) {
    return o.s.equals(this.s);
  }

  boolean receiversSame(S12SelfSymbol o) {
    return o.s.equals(o.s);
  }

  boolean receiversTwo(S12SelfSymbol o, S12SelfSymbol p) {
    return o.s.equals(p.s);
  }

  boolean nestedThis() {
    return this.other.s.equals(other.s);
  }

  boolean nestedDifferent() {
    return other.s.equals(other.other.s);
  }

  boolean lateLocal() {
    boolean r = s.equals(this.s);
    String s = "";
    return r && s.equals(this.s);
  }

  boolean lateLocalSame() {
    String s = "";
    return s.equals(s);
  }

  boolean staticQualified() {
    return S12SelfSymbol.t.equals(S12SelfSymbol.t);
  }

  boolean staticMixed() {
    return t.equals(S12SelfSymbol.t);
  }

  boolean arrays(int[] x, int[] y) {
    return Objects.equal(x.length, x.length) || Objects.equal(x.length, y.length);
  }

  boolean arrayFields() {
    return Objects.equal(arr.length, brr.length) || Objects.equal(arr.length, this.arr.length);
  }

  boolean lambda() {
    Function<String, Boolean> f = a -> a.equals(a);
    Function<String, Boolean> g = a -> a.equals(s);
    return f.apply("") && g.apply("");
  }

  boolean pattern(Object o) {
    return o instanceof String p && p.equals(p);
  }

  boolean patternOther(Object o) {
    return o instanceof String p && p.equals(o);
  }

  boolean anonymous(String v) {
    return new Object() {
      String v = "";

      @Override
      public boolean equals(Object x) {
        return v.equals(this.v);
      }

      @Override
      public int hashCode() {
        return v.equals(S12SelfSymbol.this.s) ? 1 : 0;
      }
    }.equals(null);
  }

  boolean localClassShadow(String v) {
    class Local {
      String v = "";

      boolean same() {
        return v.equals(v);
      }
    }
    return v.equals(v);
  }

  boolean forEach(Iterable<String> items) {
    for (String item : items) {
      if (item.equals(item)) {
        return true;
      }
    }
    return false;
  }

  boolean tryCatch() {
    try {
      return true;
    } catch (RuntimeException e) {
      return e.equals(e);
    }
  }

  class Inner {
    String s = "";

    boolean outerField() {
      return s.equals(S12SelfSymbol.this.s);
    }

    boolean ownField() {
      return s.equals(this.s);
    }

    boolean ownSame() {
      return s.equals(s);
    }

    boolean qualifiedSame() {
      return S12SelfSymbol.this.s.equals(S12SelfSymbol.this.s);
    }

    boolean outerOther() {
      return other.s.equals(S12SelfSymbol.this.other.s);
    }
  }

  class InnerNoField {
    boolean outerSame() {
      return s.equals(s);
    }
  }

  @SuppressWarnings("SelfEquals")
  boolean suppressed(String s) {
    return s.equals(s);
  }

  @SuppressWarnings("SelfComparison")
  int suppressedCompare(String s) {
    return s.compareTo(s);
  }

  int compare(String s) {
    return s.compareTo(this.s) + s.compareTo(s);
  }
}
