package p;
public class G34 implements java.io.Serializable {
 private static G34 I;
 public static G34 get() { G34 x = I; x = x == null ? new G34() : x; I = x; return x; }
}
