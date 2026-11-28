package p;
public class P15 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P15(int a) {}
 P15() {}
 private static P15 I;
 public static P15 get() { if (I == null) { I = new P15(); } return flag ? I : null; }
}
