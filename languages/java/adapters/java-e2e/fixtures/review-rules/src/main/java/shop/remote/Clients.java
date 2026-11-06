package shop.remote;

import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.async.CloseableHttpAsyncClient;
import org.apache.hc.client5.http.impl.async.HttpAsyncClients;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.util.Timeout;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;

public final class Clients {
  public CloseableHttpClient apacheDefault() {
    return HttpClients.createDefault(); // violation: HttpWithoutTimeout
  }

  public CloseableHttpAsyncClient apacheAsync() {
    return HttpAsyncClients.createDefault(); // violation: HttpWithoutTimeout
  }

  public CloseableHttpClient apacheBuilder() {
    return HttpClients.custom().disableCookieManagement().build(); // violation: HttpWithoutTimeout
  }

  public CloseableHttpClient apacheConfigured() {
    RequestConfig config = RequestConfig.custom().setResponseTimeout(Timeout.ofSeconds(5)).build();
    return HttpClients.custom().setDefaultRequestConfig(config).build();
  }

  public CloseableHttpClient apacheConfiguredLater(RequestConfig config) {
    HttpClientBuilder builder = HttpClientBuilder.create();
    builder.setDefaultRequestConfig(config);
    return builder.build();
  }

  public HttpComponentsClientHttpRequestFactory springFactory() {
    HttpComponentsClientHttpRequestFactory factory =
        new HttpComponentsClientHttpRequestFactory(HttpClients.createDefault());
    factory.setReadTimeout(Duration.ofSeconds(5));
    return factory;
  }

  public Client jaxRs() {
    return ClientBuilder.newClient(); // violation: HttpWithoutTimeout
  }

  public Client jaxRsProperty() {
    Client client = ClientBuilder.newClient();
    client.property("jersey.config.client.readTimeout", 5_000);
    return client;
  }

  public Client jaxRsConfigured() {
    Client client = ClientBuilder.newClient();
    withTimeouts(client);
    return client;
  }

  public Client jaxRsBuilder() {
    return ClientBuilder.newBuilder().connectTimeout(2, TimeUnit.SECONDS).build(); // violation: HttpWithoutTimeout
  }

  public Client jaxRsTimed() {
    return ClientBuilder.newBuilder()
        .connectTimeout(2, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build();
  }

  private static void withTimeouts(Client client) {
    client.property("jersey.config.client.connectTimeout", 2_000);
    client.property("jersey.config.client.readTimeout", 5_000);
  }
}
