package shop.http;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.client.reactive.JdkClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration(proxyBeanMethods = false)
class HttpBeans {
  @Bean
  RestTemplate factoryLater() {
    RestTemplate template = new RestTemplate();
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(2000);
    factory.setReadTimeout(5000);
    template.setRequestFactory(factory);
    return template;
  }

  @Bean
  RestClient withFactory() {
    return RestClient.builder()
        .requestFactory(new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()))
        .build();
  }

  @Bean
  RestClient wrapped(RestTemplate template) {
    return RestClient.create(template);
  }

  @Bean
  RestClient bareBuilder() {
    return RestClient.builder().baseUrl("https://x").build(); // violation: SpringHttpClientTimeouts
  }

  @Bean
  WebClient bareWebClient() {
    return WebClient.builder().baseUrl("https://x").build(); // violation: SpringHttpClientTimeouts
  }

  @Bean
  WebClient connected() {
    return WebClient.builder()
        .clientConnector(new JdkClientHttpConnector(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()))
        .build();
  }

  @Bean
  HttpClient bareJdk() {
    return HttpClient.newBuilder().build();
  }

  @Bean
  RestTemplate inlineFactory() {
    return new RestTemplate(new SimpleClientHttpRequestFactory()); // violation: SpringHttpClientTimeouts
  }

  @Bean
  RestTemplate untimedFactory() {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory(); // violation: SpringHttpClientTimeouts
    return new RestTemplate(factory);
  }

  static HttpClient jdk() {
    return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
  }
}

@Service
class ClientHolder {
  private final RestClient other = makeClient();
  private final HttpClient timed = jdkClient();

  private static RestClient makeClient() {
    return RestClient.builder().build(); // violation: SpringHttpClientTimeouts
  }

  private static HttpClient jdkClient() {
    return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
  }

  String call() {
    return WebClient.builder().build().get().retrieve().bodyToMono(String.class).block(); // violation: SpringHttpClientPerCall
  }
}
