package p;
public class T2 implements java.io.Serializable {
 private static T2 I, J;
 public static T2 a() { if (I == null) I = new T2(); return I; }
 public static T2 b() { if (J == null) J = new T2(); return J; }
}
