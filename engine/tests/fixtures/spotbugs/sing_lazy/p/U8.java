package p;
public class U8 implements java.io.Serializable {
 private static U8 I = new U8(), J = new U8();
 public static U8 a() { return I; }
 public static U8 b() { return J; }
 public static U8 c() { if (I == null) I = new U8(); return I; }
}
