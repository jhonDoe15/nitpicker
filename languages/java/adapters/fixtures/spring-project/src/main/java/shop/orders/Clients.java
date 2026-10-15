package shop.orders;

import jakarta.annotation.PostConstruct;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

@Service
public class Clients {
  private final RestClient shared = RestClient.create(); // violation: SpringHttpClientTimeouts
  private final RestClient built;
  private final HttpClient java =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

  public Clients(RestClient.Builder builder) {
    this.built = builder.build();
  }

  public String status() {
    return RestClient.create().get().uri("/status").retrieve().body(String.class); // violation: SpringHttpClientPerCall
  }

  public void cancel() {
    new RestTemplate().delete("/cancel"); // violation: SpringHttpClientPerCall
  }

  public HttpClient fresh() {
    return HttpClient.newHttpClient(); // violation: SpringHttpClientPerCall
  }

  public HttpClient timed() {
    return HttpClient.newBuilder().build(); // violation: SpringHttpClientPerCall
  }

  public String viaBuilder() {
    return built.get().uri("/ok").retrieve().body(String.class);
  }

  @PostConstruct
  void warmUp() {
    built.get().uri("/warm").retrieve().toBodilessEntity(); // violation: SpringNoPostConstructIo
  }

  @PostConstruct
  void prepare() {
    String.valueOf(1);
  }
}

@Configuration(proxyBeanMethods = false)
class ClientConfig {
  @Bean
  RestTemplate plain() {
    return new RestTemplate(); // violation: SpringHttpClientTimeouts
  }

  @Bean
  RestClient quick() {
    return RestClient.create("https://shop.example.com"); // violation: SpringHttpClientTimeouts
  }

  @Bean
  RestTemplate timed(RestTemplateBuilder builder) {
    return builder
        .connectTimeout(Duration.ofSeconds(2))
        .readTimeout(Duration.ofSeconds(5))
        .build();
  }
}
