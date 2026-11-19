package shop.async;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public final class Registries {
  private final ConcurrentMap<String, CompletableFuture<String>> requests = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, Peer> peersByAddress = new ConcurrentHashMap<>();
  private final Map<String, Peer> standbyByAddress = new ConcurrentHashMap<>();

  final class Peer {
    private final String address;

    Peer(String address) {
      this.address = address;
    }

    void connectionFailed() {
      peersByAddress.remove(address); // violation: RemoveByKeyDropsNewerValue
    }

    void closed() {
      peersByAddress.remove(address, this);
    }

    void closedIfStillRegistered() {
      if (peersByAddress.get(address) == this) {
        peersByAddress.remove(address);
      }
    }

    void connectionTimeout() {
      standbyByAddress.remove(address); // violation: RemoveByKeyDropsNewerValue
    }

    void moveTo(String target) {
      peersByAddress.remove(address);
      peersByAddress.put(target, this);
    }

    String address() {
      return address;
    }
  }

  CompletableFuture<String> lookup(String unit) {
    CompletableFuture<String> future = new CompletableFuture<>();
    requests.put(unit, future);
    future.whenComplete((result, error) -> requests.remove(unit)); // violation: RemoveByKeyDropsNewerValue
    return future;
  }

  CompletableFuture<String> lookupOnce(String unit) {
    CompletableFuture<String> future = new CompletableFuture<>();
    requests.putIfAbsent(unit, future);
    future.whenComplete(
        (result, error) -> {
          requests.remove(unit); // violation: RemoveByKeyDropsNewerValue
        });
    return future;
  }

  CompletableFuture<String> lookupOwned(String unit) {
    CompletableFuture<String> future = new CompletableFuture<>();
    requests.put(unit, future);
    future.whenComplete((result, error) -> requests.remove(unit, future));
    return future;
  }

  CompletableFuture<String> lookupGuarded(String unit) {
    CompletableFuture<String> future = new CompletableFuture<>();
    requests.put(unit, future);
    future.whenComplete(
        (result, error) -> {
          if (requests.get(unit) == future) {
            requests.remove(unit);
          }
        });
    return future;
  }

  CompletableFuture<String> lookupAndClearOther(String unit, String other) {
    CompletableFuture<String> future = new CompletableFuture<>();
    requests.put(unit, future);
    future.whenComplete((result, error) -> requests.remove(other));
    return future;
  }

  void forget(String unit) {
    requests.remove(unit);
  }

  Peer connect(String address) {
    Peer peer = new Peer(address);
    peersByAddress.put(address, peer);
    standbyByAddress.put(address, peer);
    return peer;
  }
}
