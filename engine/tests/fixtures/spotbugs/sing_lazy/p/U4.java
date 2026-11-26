package p;
public class U4 implements java.io.Serializable {
 private static U4 I = new U4(), J = new U4(), K;
 public static U4 c() { if (K == null) K = new U4(); return K; }
 public static U4 b() { return J; }
 public static U4 a() { return I; }
}
