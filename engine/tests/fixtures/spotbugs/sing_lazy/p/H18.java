package p;
public class H18 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H18 I;
 public static H18 get() { if (I == null) { I = new H18(); } return I; }
 public static synchronized H18 get2() { return I; }
}
