package shop.remote;

import java.io.IOException;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.util.Timeout;

public final class PerRequestConfig {
  private static final RequestConfig DEADLINE =
      RequestConfig.custom().setResponseTimeout(Timeout.ofSeconds(5)).build();
  private final CloseableHttpClient client = HttpClients.createDefault();

  public String fetch(String url) throws IOException {
    HttpGet get = new HttpGet(url);
    get.setConfig(DEADLINE);
    return client.execute(get, response -> EntityUtils.toString(response.getEntity()));
  }
}
