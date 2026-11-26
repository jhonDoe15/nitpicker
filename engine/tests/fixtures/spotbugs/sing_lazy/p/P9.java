package p;
public class P9 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P9(int a) {}
 P9() {}
 private static P9 I;
 public static P9 get() { return I == null ? (I = new P9()) : I; }
}
