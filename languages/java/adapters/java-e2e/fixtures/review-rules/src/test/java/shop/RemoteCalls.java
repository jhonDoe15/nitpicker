package shop;

import java.io.IOException;
import java.io.InputStream;
import java.net.Socket;
import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

class RemoteCalls {
  private static final String API = "https://api.example.com/v1";
  private static final String LOCAL = "http://localhost:8089";
  private final RestTemplate rest = new RestTemplate();

  void callsRemoteHosts() throws IOException, InterruptedException {
    try (InputStream feed = new URL("https://example.com/feed").openStream()) { // violation: NetworkInTest
      feed.readAllBytes();
    }
    HttpRequest orders = HttpRequest.newBuilder(URI.create(API + "/orders")).build(); // violation: NetworkInTest
    HttpClient.newHttpClient().send(orders, HttpResponse.BodyHandlers.discarding());
    rest.getForObject(API + "/orders", String.class); // violation: NetworkInTest
    RestClient.builder().baseUrl(API).build(); // violation: NetworkInTest
    new Socket("db.example.com", 5432).close(); // violation: NetworkInTest
  }

  void callsLocalStubs() throws IOException {
    try (InputStream health = new URL(LOCAL + "/health").openStream()) {
      health.readAllBytes();
    }
    HttpRequest.newBuilder(URI.create("http://127.0.0.1:8089/orders")).build();
    rest.getForObject("http://localhost:8089/orders", String.class);
    RestClient.create(LOCAL);
  }
}
