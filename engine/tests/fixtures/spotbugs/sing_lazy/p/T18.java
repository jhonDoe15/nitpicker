package p;
public class T18 implements java.io.Serializable {
 private static T18 I;
 public static T18 a() { if (I == null) { I = new T18(); } return I; }
 @Deprecated
 public static
 T18 b() { if (I == null) { I = new T18(); } return I; }
}
