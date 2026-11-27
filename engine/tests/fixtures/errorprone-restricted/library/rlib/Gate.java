package rlib;

import com.google.errorprone.annotations.RestrictedApi;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Target;

public class Gate implements Door {
  public static final String WHY = "compiled é reason";

  @Target({ElementType.METHOD, ElementType.CONSTRUCTOR, ElementType.TYPE})
  public @interface Ok {}

  @Inherited
  @Target({ElementType.METHOD, ElementType.TYPE})
  public @interface Loud {}

  @RestrictedApi(explanation = "gate " + 1 + '!', allowlistAnnotations = Ok.class, allowlistWithWarningAnnotations = Loud.class)
  public Gate() {}

  @RestrictedApi(explanation = WHY, link = "https://example.com/gate", allowlistAnnotations = {Ok.class})
  public void open() {}

  @RestrictedApi(explanation = "tests only", allowedOnPath = ".*/ruse/tests/.*")
  public static void probe() {}

  @RestrictedApi(explanation = "ahead", allowedOnPath = ".*(?=Ahead).*")
  public static void ahead() {}

  @Override
  public void knock() {}

  public static class Wide extends Gate {
    @Override
    public void open() {}
  }
}
