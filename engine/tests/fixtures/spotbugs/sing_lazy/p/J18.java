package p;
public class J18 implements java.io.Serializable {
 private static final J18 I = new J18();
 public static J18 get() { return I; }
 public static J18 make() { J18 a = new J18(); J18 b = a; return b; }
}
