package e;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class B4Canonical {
  static class Base {
    public static class Inner {}
    public interface Callback {}
    protected static class Prot {}
    static class Pkg {}
    private static class Priv {}
  }

  static class Sub extends Base {}

  static class Sub2 extends Sub {}

  static class Impl implements Base.Callback {}

  Sub.Inner a;
  Base.Inner b;
  Sub2.Inner c;
  List<Sub.Inner> d = new ArrayList<Sub.Inner>();
  Map<String, Sub.Callback> e = new HashMap<String, Sub.Callback>();
  Sub.Prot f;
  Sub.Pkg g;
  B4Canonical.Sub.Inner h;
  e.B4Canonical.Sub.Inner i;
  Map.Entry<String, String> j;
  java.util.Map.Entry<String, String> k;
  HashMap.SimpleEntry<String, String> l;
  java.util.HashMap.SimpleEntry<String, String> m;
  Sub.Inner[] n;

  Object o() {
    return new Sub.Inner();
  }

  void p(Object x) {
    Sub.Inner q = (Sub.Inner) x;
    boolean r = x instanceof Sub.Inner;
    Class<?> s = Sub.Inner.class;
  }

  @SuppressWarnings("NonCanonicalType")
  Sub.Inner suppressed;
}

class B4CanonicalOther extends B4Canonical.Base {
  Inner a;
  B4Canonical.Sub.Inner b;

  static abstract class Top {
    public abstract static class Mid extends Top {}
    public abstract static class Leaf extends Top {}
  }

  boolean p(Object o) {
    return o instanceof Top.Mid.Leaf;
  }

  Object anon() {
    return new Top.Mid.Leaf() {};
  }
}
