package shop.outbound;

import java.net.URI;
import java.net.http.HttpRequest;
import java.util.Map;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestOperations;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

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

  public Object chained(String url) {
    String first = url;
    String second = first.trim() + "/rates";
    Object a = template.getForObject(second, String.class); // violation: SpringOutboundUrl
    String again = BASE;
    again = url;
    Object b = template.getForObject(again, String.class); // violation: SpringOutboundUrl
    return a;
  }

  public record Target(String url, String currency) {}

  public Object accessors(Target target) {
    Object a = client.get().uri(target.url()).retrieve().body(String.class); // violation: SpringOutboundUrl
    String address = target.url().trim();
    Object b = template.getForObject(address, String.class); // violation: SpringOutboundUrl
    Object c = template.getForObject(BASE + "/rates/{currency}", String.class, target.currency());
    return a;
  }

  public Object lambdas(String host, String currency) {
    Object a = web.get().uri(uri -> uri.scheme("https").host(host).build()).retrieve().bodyToMono(String.class); // violation: SpringOutboundUrl
    Object b = web.get().uri(uri -> uri.path("/rates/{c}").build(currency)).retrieve().bodyToMono(String.class);
    return a;
  }

  public Object jdk(String url, String currency) {
    HttpRequest a = HttpRequest.newBuilder(URI.create(url)).build(); // violation: SpringOutboundUrl
    HttpRequest b = HttpRequest.newBuilder().uri(URI.create(url)).build(); // violation: SpringOutboundUrl
    HttpRequest c = HttpRequest.newBuilder(URI.create(BASE + "/rates")).build();
    return a;
  }

  public Object templated(String currency) {
    URI uri = UriComponentsBuilder.fromUriString(BASE).path("/rates/{c}").buildAndExpand(currency).toUri();
    Object a = template.getForObject(uri, Object.class);
    return a;
  }

  public Object viaHelpers(String url) {
    fixed(BASE);
    return fetch(url);
  }

  private Object fetch(String address) {
    return template.getForObject(address, String.class); // violation: SpringOutboundUrl
  }

  private Object fixed(String address) {
    return template.getForObject(address, String.class);
  }

  public Object constantCaller() {
    String address = BASE + "/rates";
    return viaConstantLocal(address);
  }

  private Object viaConstantLocal(String address) {
    return template.getForObject(address, String.class);
  }

  public Object reassignedCaller(String url) {
    String address = BASE;
    address = url;
    return viaReassignedLocal(address);
  }

  private Object viaReassignedLocal(String address) {
    return template.getForObject(address, String.class); // violation: SpringOutboundUrl
  }
}
