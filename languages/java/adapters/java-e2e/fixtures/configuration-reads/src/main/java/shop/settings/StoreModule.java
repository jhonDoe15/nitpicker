package shop.settings;

import dagger.Module;
import dagger.Provides;

@Module
public final class StoreModule {
  private StoreModule() {}

  @Provides
  static String region() {
    return System.getenv("SHOP_REGION");
  }
}
