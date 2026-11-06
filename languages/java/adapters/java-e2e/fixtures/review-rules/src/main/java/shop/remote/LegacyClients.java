package shop.remote;

import org.apache.http.client.config.RequestConfig;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.apache.http.impl.client.HttpClients;

public final class LegacyClients {
  private final CloseableHttpClient shared = HttpClients.createSystem(); // violation: HttpWithoutTimeout

  public CloseableHttpClient shared() {
    return shared;
  }

  public CloseableHttpClient pooled() {
    return HttpClientBuilder.create().setMaxConnTotal(20).build(); // violation: HttpWithoutTimeout
  }

  public CloseableHttpClient timed() {
    RequestConfig config = RequestConfig.custom().setConnectTimeout(2_000).setSocketTimeout(5_000).build();
    return HttpClientBuilder.create().setDefaultRequestConfig(config).build();
  }
}
