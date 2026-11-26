package p;
public class T14 implements java.io.Serializable {
 private static T14 I;
 public static T14 a() { if (I == null) { I = new T14(); } return I; }
 public static T14 a2() { return a(); }
}
