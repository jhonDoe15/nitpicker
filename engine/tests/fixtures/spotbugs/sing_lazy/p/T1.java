package p;
public class T1 implements java.io.Serializable {
 private static T1 I;
 public static synchronized T1 a() { if (I == null) I = new T1(); return I; }
 public static T1 b() { if (I == null) I = new T1(); return I; }
 public static T1 c() { return I; }
}
