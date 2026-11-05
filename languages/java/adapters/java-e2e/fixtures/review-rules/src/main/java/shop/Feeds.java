package shop;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

public final class Feeds {
  private static final URI BASE = URI.create("https://feeds.example/");
  private static final List<String> MIRRORS = List.of("a", "b");
  private final HttpClient client;

  public Feeds(HttpClient client) {
    this.client = client;
  }

  public Flux<String> all(List<String> ids) {
    return Flux.fromIterable(ids).flatMap(this::fetch); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> each(List<String> ids) {
    return Flux.fromIterable(ids).filter(id -> !id.isBlank()).flatMap(id -> fetch(id)); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> ordered(List<String> ids) {
    return Flux.fromStream(ids.stream()).flatMapSequential(this::fetch); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> direct(String[] ids) {
    return Flux.fromArray(ids).flatMap(id -> Mono.fromCallable(() -> body(id)).subscribeOn(Schedulers.boundedElastic())); // violation: UnboundedReactiveFanOut
  }

  public Mono<List<String>> zipped(List<String> ids) {
    return Mono.zip(ids.stream().map(this::fetch).toList(), parts -> Arrays.stream(parts).map(String.class::cast).toList()); // violation: UnboundedReactiveFanOut
  }

  public Mono<Void> joined(List<String> ids) {
    return Mono.when(ids.stream().map(id -> fetch(id)).toList()); // violation: UnboundedReactiveFanOut
  }

  public Flux<List<Object>> paired(List<String> ids) {
    List<Mono<String>> calls = ids.stream().map(this::fetch).toList();
    return Flux.zip(calls, Arrays::asList); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> merged(List<String> ids) {
    return Flux.merge(ids.stream().map(this::fetch).toList()); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> sequential(List<String> ids) {
    return Flux.mergeSequential(ids.stream().map(this::fetch).toList()); // violation: UnboundedReactiveFanOut
  }

  public Mono<List<String>> zippedLate(List<String> ids) {
    return Mono.zipDelayError(ids.stream().map(this::fetch).toList(), parts -> Arrays.stream(parts).map(String.class::cast).toList()); // violation: UnboundedReactiveFanOut
  }

  public Mono<Void> joinedLate(List<String> ids) {
    return Mono.whenDelayError(ids.stream().map(this::fetch).toList()); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> mergedLocal(List<String> ids) {
    List<Mono<String>> calls = ids.stream().map(this::fetch).toList();
    return Flux.merge(calls); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> referencedArray(String[] ids) {
    return Flux.fromArray(ids).flatMap(this::fetch); // violation: UnboundedReactiveFanOut
  }

  public Flux<List<Object>> pairedDirect(List<String> ids) {
    return Flux.zip(ids.stream().map(this::fetch).toList(), Arrays::asList); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> cutToSize(List<String> ids) {
    return Flux.fromIterable(ids).take(ids.size()).flatMap(this::fetch); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> varargs(List<String> ids) {
    return Flux.merge(ids.stream().map(this::fetch).toArray(Mono[]::new)); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> copied(List<String> ids) {
    return Flux.fromIterable(List.copyOf(ids)).flatMap(this::fetch); // violation: UnboundedReactiveFanOut
  }

  public Flux<String> limited(List<String> ids) {
    return Flux.fromIterable(ids).flatMap(this::fetch, 8);
  }

  public Flux<String> oneAtATime(List<String> ids) {
    return Flux.fromIterable(ids).concatMap(this::fetch);
  }

  public Flux<String> batched(List<String> ids) {
    return Flux.fromIterable(ids).buffer(20).flatMap(this::fetchAll);
  }

  public Flux<String> mirrors() {
    return Flux.fromIterable(MIRRORS).flatMap(this::fetch);
  }

  public Flux<String> literal() {
    return Flux.fromIterable(List.of("a", "b")).flatMap(this::fetch);
  }

  public Mono<String> two(String first, String second) {
    return Mono.zip(fetch(first), fetch(second)).map(pair -> pair.getT1() + pair.getT2());
  }

  public Mono<Void> mirrored() {
    return Mono.when(MIRRORS.stream().map(this::fetch).toList());
  }

  public Flux<String> local(List<String> ids) {
    return Flux.fromIterable(ids).flatMap(id -> Mono.just(id.trim()));
  }

  public Flux<String> streamed(Flux<String> ids) {
    return ids.flatMap(this::fetch);
  }

  public Mono<String> chained(String id) {
    return fetch(id).flatMap(this::fetch);
  }

  public Flux<String> firstTen(List<String> ids) {
    return Flux.fromIterable(ids).take(10).flatMap(this::fetch);
  }

  public Flux<String> mergedMirrors() {
    return Flux.merge(MIRRORS.stream().map(this::fetch).toList());
  }

  public Flux<String> sequentialLimited(List<String> ids) {
    return Flux.mergeSequential(ids.stream().map(this::fetch).toList(), 4, 32);
  }

  public Flux<String> pairOfTwo(String first, String second) {
    return Flux.merge(fetch(first), fetch(second));
  }

  public Flux<String> described(List<String> ids) {
    return Flux.fromIterable(ids).flatMap(id -> Mono.just(id + client.toString()));
  }

  private Mono<String> fetch(String id) {
    return Mono.fromCallable(() -> body(id)).subscribeOn(Schedulers.boundedElastic());
  }

  private Mono<String> fetchAll(List<String> ids) {
    return Mono.fromCallable(() -> body(String.join(",", ids))).subscribeOn(Schedulers.boundedElastic());
  }

  private String body(String id) throws IOException, InterruptedException {
    HttpRequest request = HttpRequest.newBuilder(BASE.resolve(id)).timeout(Duration.ofSeconds(10)).build();
    return client.send(request, HttpResponse.BodyHandlers.ofString()).body();
  }
}
