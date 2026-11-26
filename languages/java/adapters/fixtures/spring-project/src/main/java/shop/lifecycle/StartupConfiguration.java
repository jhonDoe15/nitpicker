package shop.lifecycle;

import java.util.List;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class StartupConfiguration {
  @Bean(initMethod = "prepare")
  public Warmer warmer() {
    return new Warmer();
  }

  public static class Unrelated {
    @Cacheable("defaults")
    public List<String> prepare() {
      return List.of("unrelated");
    }
  }

  public static class Warmer {
    @Cacheable("defaults") // violation: SpringAnnotationBeforeProxy
    public List<String> prepare() {
      return List.of("warm");
    }

    @Cacheable("defaults")
    public List<String> current() {
      return List.of("current");
    }
  }
}
