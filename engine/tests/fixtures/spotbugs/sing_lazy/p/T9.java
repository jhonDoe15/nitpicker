package p;
public class T9 implements java.io.Serializable {
 private static T9 I;
 public static T9 a() { if (I == null) I = new T9(); synchronized (T9.class) { return I; } }
}
