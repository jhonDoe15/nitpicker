package shop.wiring;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.context.properties.ConfigurationPropertiesBinding;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.env.Environment;
import shop.catalog.ProductRepository;

@Configuration(proxyBeanMethods = false)
public class PostProcessors {
  @Bean
  BeanPostProcessor tracing() { // violation: SpringStaticPostProcessorBean
    return new BeanPostProcessor() {};
  }

  @Bean
  PropertySourcesPlaceholderConfigurer placeholders() { // violation: SpringStaticPostProcessorBean
    return new PropertySourcesPlaceholderConfigurer();
  }

  @Bean
  @ConfigurationPropertiesBinding
  Converter<String, Long> cents() { // violation: SpringStaticPostProcessorBean
    return Long::valueOf;
  }

  @Bean
  static BeanPostProcessor auditing(ProductRepository products) { // violation: SpringStaticPostProcessorBean
    return new BeanPostProcessor() {};
  }

  @Bean
  static BeanPostProcessor metrics(Environment environment, ObjectProvider<ProductRepository> products) {
    return new BeanPostProcessor() {};
  }

  @Bean
  static BeanFactoryPostProcessor names(@Value("${shop.prefix:shop}") String prefix) {
    return factory -> factory.getBeanDefinitionNames();
  }

  @Bean
  @ConfigurationPropertiesBinding
  static Converter<String, Integer> percent() {
    return Integer::valueOf;
  }

  @Bean
  String label(ProductRepository products) {
    return products.toString();
  }
}
