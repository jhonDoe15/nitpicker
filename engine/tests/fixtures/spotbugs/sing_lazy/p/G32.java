package p;
public class G32 implements java.io.Serializable {
 private static G32 I = new G32();
 public static G32 get() { Runnable r = () -> { }; return I; }
}
