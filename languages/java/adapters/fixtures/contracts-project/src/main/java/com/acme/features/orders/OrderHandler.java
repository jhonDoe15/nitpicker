package com.acme.features.orders;

import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;

public class OrderHandler {
  public Mono<ServerResponse> list(ServerRequest request) {
    return Mono.empty();
  }
}
