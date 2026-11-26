package p;
public class Cap {
    public static class C { public boolean equals(Object o){return o==this;} public int hashCode(){return 1;} }
    static Object cap(int x) { return new C() { int g() { return x; } }; }       // captures x -> synthetic val$x
    Object cap2() { return new C() { int g() { return hashCode(); } }; }          // this$0 only
    static Object cap3(final String s) { class L extends C { String h() { return s; } } return new L(); }
    static Object nocap() { return new C() { }; }
}
