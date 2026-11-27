import com.google.errorprone.annotations.InlineMe;
import java.util.function.Supplier;

public final class J5Iv6 {
  @InlineMe(replacement = "this.after(/* name= */ name)")
  @Deprecated
  public void before(String name) {
    after(/* name= */ name);
  }

  public void after(String name) {}
}

