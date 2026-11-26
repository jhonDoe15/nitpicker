package p;
public class J3 implements java.io.Serializable {
 private static final J3 I = new J3();
 public static J3 get() { return I; }
 static boolean c;
 static J3 make() { return c ? new J3() : I; }
}
