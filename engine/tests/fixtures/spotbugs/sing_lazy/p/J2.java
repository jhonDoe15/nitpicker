package p;
public class J2 implements java.io.Serializable {
 private static final J2 I = new J2();
 public static J2 get() { return I; }
 int v;
 public static J2 make(int a) { J2 x = new J2(); x.v = a; return x; }
}
