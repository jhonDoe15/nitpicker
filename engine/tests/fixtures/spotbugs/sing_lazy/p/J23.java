package p;
public class J23 implements java.io.Serializable {
 private static final J23 I = new J23();
 public static J23 get() { return I; }
 public static J23 make() { final J23 x = new J23(); synchronized (J23.class) { return x; } }
}
