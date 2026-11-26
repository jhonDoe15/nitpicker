package p;
public class J1 implements java.io.Serializable {
 private static final J1 I = new J1();
 public static J1 get() { return I; }
 public J1 copy() { return new J1(); }
}
