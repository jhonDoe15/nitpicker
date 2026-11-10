package shop.settings;

import com.google.inject.AbstractModule;
import com.google.inject.Provides;

public final class ShopModule extends AbstractModule {
  @Override
  protected void configure() {
    bind(String.class).toInstance(System.getenv("SHOP_REGION"));
  }

  @Provides
  int port() {
    return Integer.getInteger("shop.port", 8080);
  }
}
