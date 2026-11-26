package p;
public class T5 implements java.io.Serializable {
 private static T5 I;
 public static T5 a(int x) { if (I == null) I = new T5(); return I; }
}
