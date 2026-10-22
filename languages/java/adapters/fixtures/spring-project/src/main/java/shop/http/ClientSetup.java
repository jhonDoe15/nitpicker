package shop.http;

import java.time.Duration;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

@Configuration(proxyBeanMethods = false)
class ClientSetup {
  @Bean
  RestClient partner() {
    return client("https://partner.example.com");
  }

  @Bean
  RestClient billing() {
    return client("https://billing.example.com");
  }

  private RestClient client(String url) {
    return RestClient.builder().requestFactory(factory()).baseUrl(url).build();
  }

  private SimpleClientHttpRequestFactory factory() {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(2));
    factory.setReadTimeout(Duration.ofSeconds(5));
    return factory;
  }

  @Bean
  RestClient untimedHelper() {
    return untimed();
  }

  private RestClient untimed() {
    return RestClient.builder().baseUrl("https://x").build(); // violation: SpringHttpClientTimeouts
  }

  @Bean
  RestTemplate plainBuilder() {
    return new RestTemplateBuilder().rootUri("https://x").build(); // violation: SpringHttpClientTimeouts
  }

  @Bean
  RestTemplate timedBuilder() {
    return new RestTemplateBuilder()
        .connectTimeout(Duration.ofSeconds(2))
        .readTimeout(Duration.ofSeconds(5))
        .build();
  }

  @Bean
  RestTemplate injectedBuilder(RestTemplateBuilder builder) {
    return builder.rootUri("https://x").build();
  }

  @Bean
  WebClient nettyUntimed() {
    HttpClient netty = HttpClient.create(); // violation: SpringHttpClientTimeouts
    return WebClient.builder().clientConnector(new ReactorClientHttpConnector(netty)).build();
  }

  @Bean
  WebClient nettyTimed() {
    HttpClient netty = HttpClient.create().responseTimeout(Duration.ofSeconds(5));
    return WebClient.builder().clientConnector(new ReactorClientHttpConnector(netty)).build();
  }

  @Bean
  WebClient nettyTimedLater() {
    HttpClient netty = HttpClient.create();
    netty = netty.responseTimeout(Duration.ofSeconds(5));
    return WebClient.builder().clientConnector(new ReactorClientHttpConnector(netty)).build();
  }

  @Bean
  WebClient defaultConnector() {
    return WebClient.builder()
        .clientConnector(new ReactorClientHttpConnector()) // violation: SpringHttpClientTimeouts
        .build();
  }
}

@Service
class Lookups {
  private final RestClient client;

  Lookups(RestClient.Builder builder) {
    this.client = builder.baseUrl("https://x").build();
  }

  String perCall() {
    return new RestTemplateBuilder().build().getForObject("https://x", String.class); // violation: SpringHttpClientPerCall
  }

  String shared() {
    return client.get().uri("/y").retrieve().body(String.class);
  }

  RestClient leaked() {
    return helperUsedByCall();
  }

  private RestClient helperUsedByCall() {
    return RestClient.create(); // violation: SpringHttpClientPerCall
  }
}
