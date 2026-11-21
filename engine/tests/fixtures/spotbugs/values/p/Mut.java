package p;
public class Mut { int v; public void setV(int x) { v = x; } public static Mut make() { return new Mut(); } public static Mut getDefault() { return new Mut(); }
  public static B newB(Mut m) { return new B(); }
  public static class B { public B merge(Mut m) { return this; } public Mut build() { return new Mut(); } } }
