package p;
public class U5 implements java.io.Serializable {
 private static U5 I, J;
 public static U5 b() { if (J == null) J = new U5(); return J; }
 public static U5 a() { if (I == null) I = new U5(); return I; }
}
