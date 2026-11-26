package p;
public class J4 implements java.io.Serializable {
 private static final J4 I = new J4();
 public static J4 get() { return I; }
 public static void fill(java.util.List<J4> l) { l.add(new J4()); }
}
