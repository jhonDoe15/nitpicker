package shop.settings.entry;

import io.quarkus.runtime.QuarkusApplication;
import io.quarkus.runtime.annotations.QuarkusMain;

@QuarkusMain
public final class Entry implements QuarkusApplication {
  @Override
  public int run(String... args) {
    return Integer.getInteger("shop.exit", 0) + System.getenv().size();
  }
}
