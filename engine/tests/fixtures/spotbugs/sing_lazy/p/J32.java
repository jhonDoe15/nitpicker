package p;
public class J32 implements java.io.Serializable {
 private static final J32 I = new J32();
 public static J32 get() { return I; }
 public static J32 make() { J32 x = new J32(); try { return x; } finally { } }
}
