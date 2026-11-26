package p;
public class T7 implements java.io.Serializable {
 private static T7 I;
 public static T7 b() { return I; }
 public static T7 a() { if (I == null) I = new T7(); return I; }
}
