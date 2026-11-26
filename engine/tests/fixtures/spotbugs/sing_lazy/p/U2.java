package p;
public class U2 implements java.io.Serializable {
 private static U2 I = new U2(), J = new U2(), K;
 public static U2 a() { return I; }
 public static U2 b() { return J; }
 public static U2 c() { if (K == null) K = new U2(); return K; }
}
