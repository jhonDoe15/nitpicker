package p;
public class T11 implements java.io.Serializable {
 private static T11 I;
 public static T11 a() { if (I == null) I = new T11(); return I; }
 public static T11 b() { if (I == null) I = new T11(); return I; }
}
