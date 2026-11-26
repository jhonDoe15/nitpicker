package p;
public class T3 implements java.io.Serializable {
 private static T3 I = new T3();
 public static T3 a() { return I; }
 public static T3 b() { if (I == null) I = new T3(); return I; }
}
