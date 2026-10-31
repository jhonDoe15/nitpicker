package com.acme.features.orders;

import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;

@Controller("/orders")
public class OrderEndpoint {
  public HttpResponse<OrderView> show(long id) {
    return null;
  }
}
