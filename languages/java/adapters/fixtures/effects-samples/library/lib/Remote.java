package lib;

import org.springframework.web.client.RestClient;

public class Remote {
  RestClient rest;

  public String load(long id) {
    return rest.get().uri("/x/{id}", id).body();
  }
}
