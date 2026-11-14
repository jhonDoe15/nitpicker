package org.springframework.web.client;

public interface RestClient {
  Spec get();

  interface Spec {
    Spec uri(String uri, Object... values);

    String body();
  }
}
