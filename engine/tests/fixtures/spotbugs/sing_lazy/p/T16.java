package p;
public class T16 implements java.io.Serializable {
 private static T16 I;
 public static T16 a() { if (I == null) I = new T16(); return I; }
 public static T16 b() { return I; }
 public static T16 c() { return I; }
}
