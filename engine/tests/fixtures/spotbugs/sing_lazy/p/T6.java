package p;
public class T6 implements java.io.Serializable {
 private static T6 I;
 public static synchronized T6 a() { if (I == null) I = new T6(); return I; }
 public static T6 b() { return I; }
}
