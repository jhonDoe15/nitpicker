package p;
public class P3 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P3(int a) {}
 P3() {}
 private static P3 I;
 public static P3 get() { if (I == null) { int a = 3; I = new P3(); } return I; }
}
