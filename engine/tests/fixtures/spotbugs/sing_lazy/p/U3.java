package p;
public class U3 implements java.io.Serializable {
 private static U3 I; private static U3 J = new U3();
 public static U3 a() { if (I == null) I = new U3(); return I; }
 public static U3 b() { return J; }
}
