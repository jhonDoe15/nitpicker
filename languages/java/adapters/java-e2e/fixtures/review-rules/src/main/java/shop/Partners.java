package shop;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLConnection;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.security.GeneralSecurityException;
import java.time.Duration;
import javax.crypto.Mac;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.util.Timeout;

public final class Partners {
  private static final Duration TIMEOUT = Duration.ofSeconds(5);
  private static final String LEGACY_SIGNATURE = "HmacMD5";
  private static final String FEED = "https://feed.partners.example.com/orders";
  private static final boolean INSECURE = Boolean.parseBoolean(System.getenv("PARTNER_INSECURE"));

  private final HttpClient bare = HttpClient.newHttpClient(); // violation: HttpWithoutTimeout
  private final HttpClient timed = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();

  public HttpClient clients(boolean fast) {
    return fast ? bare : timed;
  }

  public HttpRequest order(URI uri) {
    return HttpRequest.newBuilder(uri).GET().build(); // violation: HttpWithoutTimeout
  }

  public HttpRequest timedOrder(URI uri) {
    HttpRequest.Builder builder = HttpRequest.newBuilder(uri);
    builder.timeout(TIMEOUT);
    return builder.GET().build();
  }

  public int status(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection(); // violation: HttpWithoutTimeout
    connection.setReadTimeout(1_000);
    return connection.getResponseCode();
  }

  public int timedStatus(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setConnectTimeout(1_000);
    connection.setReadTimeout(1_000);
    return connection.getResponseCode();
  }

  public InputStream feed() throws IOException {
    URL url = URI.create(FEED).toURL();
    return url.openStream(); // violation: HttpWithoutTimeout
  }

  public InputStream feedConnection() throws IOException {
    URLConnection connection = URI.create(FEED).toURL().openConnection(); // violation: HttpWithoutTimeout
    return connection.getInputStream();
  }

  public InputStream chainedFeed() throws IOException {
    return URI.create(FEED).toURL().openConnection().getInputStream(); // violation: HttpWithoutTimeout
  }

  public InputStream timedFeed() throws IOException {
    URLConnection connection = URI.create(FEED).toURL().openConnection();
    connection.setConnectTimeout(1_000);
    connection.setReadTimeout(1_000);
    return connection.getInputStream();
  }

  public InputStream bundledFeed() throws IOException {
    return Partners.class.getResource("/orders.json").openStream();
  }

  public CloseableHttpClient apacheClient(boolean configured) {
    if (configured) {
      RequestConfig config = RequestConfig.custom().setResponseTimeout(Timeout.ofSeconds(5)).build();
      return HttpClients.custom().setDefaultRequestConfig(config).build();
    }
    return HttpClients.createDefault(); // violation: HttpWithoutTimeout
  }

  public CloseableHttpClient bareApacheClient() {
    return HttpClients.custom().build(); // violation: HttpWithoutTimeout
  }

  public Mac legacySigner() throws GeneralSecurityException {
    return Mac.getInstance(LEGACY_SIGNATURE); // violation: WeakHmac
  }

  public Mac signer(boolean protocolFixed) throws GeneralSecurityException {
    return Mac.getInstance(protocolFixed ? "HmacSHA1" : "HmacSHA256");
  }

  public void trustPartners() {
    if (INSECURE) {
      HttpsURLConnection.setDefaultHostnameVerifier((host, session) -> true); // violation: TlsVerificationOff
      System.setProperty("jdk.internal.httpclient.disableHostnameVerification", "true"); // violation: TlsVerificationOff
    }
  }

  public HostnameVerifier partnerHosts() {
    return (host, session) -> host.endsWith(".partners.example.com");
  }
}
