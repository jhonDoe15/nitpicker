package p;
public class H17 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H17 I;
 public static synchronized H17 get() { if (I == null) { I = new H17(); } return I; }
 public static H17 get2() { if (I == null) { I = new H17(); } return I; }
}
