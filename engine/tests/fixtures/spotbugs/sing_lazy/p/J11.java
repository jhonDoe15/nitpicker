package p;
public class J11 implements java.io.Serializable {
 private static final J11 I = new J11();
 public static J11 get() { return I; }
 public static J11 make(J11 x) { return x == null ? new J11() : x; }
}
