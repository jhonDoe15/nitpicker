import com.google.errorprone.annotations.InlineMe;
import java.util.function.Supplier;

public final class J5Iv7 {
  @InlineMe(replacement = "this.after(/* name1= */ name1, /* name2= */ name2)")
  @Deprecated
  public void before(String name1, String name2) {
    after(/* name1= */ name1, /* name2= */ name2);
  }

  public void after(String name1, String name2) {}
}

