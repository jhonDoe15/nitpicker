package shop.outbound;

import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestOperations;
import org.springframework.web.reactive.function.client.WebClient;

@Component
public class Outbound {
  private static final String BASE = "https://rates.example.com";

  private final RestOperations template;
  private final RestClient client;
  private final WebClient web;

  public Outbound(RestOperations template, RestClient client, WebClient web) {
    this.template = template;
    this.client = client;
    this.web = web;
  }

  public Object template(String url, String host) {
    Object plain = template.getForObject(url, String.class); // violation: SpringOutboundUrl
    Object mapped = template.getForEntity(url, String.class, Map.of()); // violation: SpringOutboundUrl
    Object posted = template.postForObject(URI.create(url), "x", String.class); // violation: SpringOutboundUrl
    Object sent = template.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, String.class); // violation: SpringOutboundUrl
    Object joined = template.getForObject("https://" + host + "/rates", String.class); // violation: SpringOutboundUrl
    String derived = url.trim();
    Object local = template.getForObject(derived, String.class); // violation: SpringOutboundUrl
    return plain;
  }

  public Object clients(String url) {
    Object rest = client.get().uri(url).retrieve().body(String.class); // violation: SpringOutboundUrl
    Object reactive = web.get().uri(url, "x").retrieve().bodyToMono(String.class); // violation: SpringOutboundUrl
    Object created = RestClient.create(url); // violation: SpringHttpClientPerCall, SpringOutboundUrl
    Object created2 = WebClient.create(url); // violation: SpringHttpClientPerCall, SpringOutboundUrl
    Object built = WebClient.builder().baseUrl(url).build(); // violation: SpringHttpClientPerCall, SpringOutboundUrl
    Object built2 = RestClient.builder().baseUrl(url).build(); // violation: SpringHttpClientPerCall, SpringOutboundUrl
    return rest;
  }

  public Object fixedHost(String currency, String id) {
    Object a = template.getForObject(BASE + "/rates/{currency}", String.class, currency);
    Object b = template.getForEntity("https://rates.example.com/rates/{id}", String.class, id);
    Object c = client.get().uri("/rates/{currency}", currency).retrieve().body(String.class);
    Object d = web.get().uri("/rates/{currency}", currency).retrieve().bodyToMono(String.class);
    Object e = client.get().uri(uri -> uri.path("/rates").queryParam("c", currency).build());
    return a;
  }
}
