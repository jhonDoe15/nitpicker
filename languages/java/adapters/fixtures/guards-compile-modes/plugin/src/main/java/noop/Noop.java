package noop;

import com.sun.source.util.JavacTask;
import com.sun.source.util.Plugin;

public final class Noop implements Plugin {
  @Override
  public String getName() {
    return "Noop";
  }

  @Override
  public void init(JavacTask task, String... args) {}
}
