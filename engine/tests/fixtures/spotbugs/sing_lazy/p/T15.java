package p;
public class T15 implements java.io.Serializable {
 private static T15 I;
 public static T15 a() { Runnable r = () -> { synchronized (T15.class) { } }; if (I == null) I = new T15(); return I; }
}
