package p;
public class U7 implements java.io.Serializable {
 private static U7 I, J;
 public static U7 a() { if (I == null) I = new U7(); return I; }
 public static synchronized U7 b() { if (J == null) J = new U7(); return J; }
}
