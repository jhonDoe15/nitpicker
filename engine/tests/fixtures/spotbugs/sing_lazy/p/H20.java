package p;
public class H20 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H20 I = new H20();
 public static H20 get() { return I; }
 public static H20 get2() { if (I == null) { I = new H20(); } return I; }
}
