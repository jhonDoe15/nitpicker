package p;
public class U1 implements java.io.Serializable {
 private static U1 I, J, K;
 public static U1 a() { if (I == null) I = new U1(); return I; }
 public static U1 b() { if (J == null) J = new U1(); return J; }
 public static U1 c() { if (K == null) K = new U1(); return K; }
}
