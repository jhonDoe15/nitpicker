package shop.registry;

import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Service;

@Service
class InitializedRegistry implements InitializingBean {
  private final Map<String, String> handlers = new HashMap<>();

  @Override
  public void afterPropertiesSet() {
    handlers.put("a", "b");
  }

  String find(String key) {
    return handlers.get(key);
  }
}

@Service
class SingletonsRegistry implements SmartInitializingSingleton {
  private final Map<String, String> handlers = new HashMap<>();

  @Override
  public void afterSingletonsInstantiated() {
    register("a");
  }

  private void register(String name) {
    handlers.put(name, name);
  }

  String find(String key) {
    return handlers.get(key);
  }
}

@Service
class CodeTable {
  private final Map<String, String> codes = new HashMap<>();

  void load() {
    codes.put("a", "b");
  }

  String find(String key) {
    return codes.get(key);
  }
}

@Configuration(proxyBeanMethods = false)
class CodeTableConfig {
  @Bean(initMethod = "load")
  CodeTable codeTable() {
    return new CodeTable();
  }
}

@Service
class LateRegistry implements InitializingBean {
  private final Map<String, String> handlers = new HashMap<>(); // violation: SpringBeanCollectionState

  @Override
  public void afterPropertiesSet() {
    handlers.put("a", "b");
  }

  void add(String key) {
    handlers.put(key, key);
  }
}
