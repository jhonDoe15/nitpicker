package p;
public class U6 implements java.io.Serializable {
 private static U6 I, J;
 public static synchronized U6 b() { if (J == null) J = new U6(); return J; }
 public static U6 a() { if (I == null) I = new U6(); return I; }
}
