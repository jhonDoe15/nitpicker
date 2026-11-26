package p;
public class T12 implements java.io.Serializable {
 private static T12 I = new T12();
 private static T12 J;
 public static T12 a() { return I; }
 public static T12 b() { if (J == null) J = new T12(); return J; }
}
