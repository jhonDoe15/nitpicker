package p;
public class J27 implements java.io.Serializable {
 private static final J27 I = new J27();
 public static J27 get() { return I; }
 public static J27 make() { J27 x = new J27(); return Other.id(x); }
}
