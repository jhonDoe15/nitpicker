package shop.registry;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Service;
import shop.catalog.ProductRepository;

@Service
class PropertiesWarmup implements InitializingBean {
  private final ProductRepository products;

  PropertiesWarmup(ProductRepository products) {
    this.products = products;
  }

  @Override
  public void afterPropertiesSet() {
    products.count(); // violation: SpringNoPostConstructIo
    prime();
  }

  private void prime() {
    products.findAll(); // violation: SpringNoPostConstructIo
  }
}

@Service
class SingletonsWarmup implements SmartInitializingSingleton {
  private final ProductRepository products;

  SingletonsWarmup(ProductRepository products) {
    this.products = products;
  }

  @Override
  public void afterSingletonsInstantiated() {
    products.count();
  }
}

class CatalogLoader {
  private final ProductRepository products;

  CatalogLoader(ProductRepository products) {
    this.products = products;
  }

  void warm() {
    products.count(); // violation: SpringNoPostConstructIo
  }

  long size() {
    return products.count();
  }
}

@Configuration(proxyBeanMethods = false)
class CatalogLoaderConfig {
  @Bean(initMethod = "warm")
  CatalogLoader catalogLoader(ProductRepository products) {
    return new CatalogLoader(products);
  }
}

@Service
class ShadowedNames {
  private final List<String> names = new ArrayList<>();

  List<String> build(List<String> input) {
    List<String> names = new ArrayList<>();
    names.add("x");
    input.forEach(names::add);
    return names;
  }

  void copy(List<String> names) {
    names.add("y");
  }

  List<String> read() {
    return List.copyOf(names);
  }
}
