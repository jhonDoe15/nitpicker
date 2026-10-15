package shop.registry;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.context.annotation.Scope;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.web.context.annotation.RequestScope;

interface Handler {
  String type();
}

@Service
class HandlerRegistry {
  private final Map<String, Handler> byType = new HashMap<>();

  HandlerRegistry(List<Handler> handlers) {
    handlers.forEach(this::register);
  }

  private void register(Handler handler) {
    byType.put(handler.type(), handler);
  }
}

@Component
class NameRegistry {
  private final List<String> names = new ArrayList<>();

  NameRegistry(List<Handler> handlers) {
    init(handlers);
  }

  private void init(List<Handler> handlers) {
    handlers.forEach(h -> names.add(h.type()));
  }
}

@Component
class LoadedRegistry {
  private final Map<String, String> loaded = new HashMap<>();

  @PostConstruct
  void load() {
    loaded.put("a", "b");
    fill();
  }

  private void fill() {
    loaded.put("c", "d");
  }
}

@Component
class LeakyRegistry {
  private final Map<String, String> entries = new HashMap<>(); // violation: SpringBeanCollectionState

  LeakyRegistry() {
    add("a");
  }

  void add(String key) {
    entries.put(key, key);
  }
}

@Component
class EventLog {
  private final List<String> events = new ArrayList<>(); // violation: SpringBeanCollectionState

  @EventListener
  void on(String event) {
    events.add(event);
  }
}

@Component
@RequestScope
class Cart {
  private final List<String> items = new ArrayList<>();

  void add(String item) {
    items.add(item);
  }
}

@Component
@Scope("prototype")
class Job {
  private final Map<String, String> state = new HashMap<>();

  void put(String key) {
    state.put(key, key);
  }
}

@Component
@Scope("singleton")
class SingletonJob {
  private final Map<String, String> state = new HashMap<>(); // violation: SpringBeanCollectionState

  void put(String key) {
    state.put(key, key);
  }
}

@Service
class Guarded {
  private final Map<String, String> byName = new HashMap<>();
  private final List<String> order = new ArrayList<>();
  private final List<String> locked = new ArrayList<>();
  private final Object monitor = new Object();
  private final ReentrantLock lock = new ReentrantLock();

  void register(String key) {
    synchronized (monitor) {
      byName.put(key, key);
    }
  }

  synchronized void append(String key) {
    order.add(key);
  }

  void guarded(String key) {
    lock.lock();
    try {
      locked.add(key);
    } finally {
      lock.unlock();
    }
  }
}
