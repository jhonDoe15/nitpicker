package shop.lifecycles;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class Sessions {
  private final Map<String, Object> sessions = new ConcurrentHashMap<>(); // violation: UnboundedCollectionField
  private final Map<String, Object> handlers = new HashMap<>();
  private final Set<String> seen = new HashSet<>();
  private final Map<Object, Object> weak = new WeakHashMap<>();
  private final List<String> events = new ArrayList<>();
  private final Map<String, Object> ended = new ConcurrentHashMap<>();
  private final Map<String, Object> bounded = new ConcurrentHashMap<>();
  private final Map<String, Object> idle = new ConcurrentHashMap<>();
  private final Map<String, Object> peeked = new ConcurrentHashMap<>(); // violation: UnboundedCollectionField
  private final java.util.concurrent.BlockingQueue<String> jobs = new java.util.concurrent.LinkedBlockingQueue<>();
  private static final Map<String, Object> SHARED = new HashMap<>();

  public void register(String name, Object handler) {
    handlers.put(name, handler);
  }

  public void open(String id, Object session) {
    sessions.put(id, session);
  }

  public void see(String token) {
    seen.add(token);
  }

  public void weak(Object key) {
    weak.put(key, key);
  }

  public void log(String event) {
    events.add(event);
  }

  public void start(String id, Object session) {
    ended.put(id, session);
  }

  public void end(String id) {
    ended.remove(id);
  }

  public void limited(String id, Object value) {
    if (bounded.size() < 100) {
      bounded.put(id, value);
    }
  }

  public void park(String id, Object value) {
    idle.put(id, value);
    jobs.add(id);
    peeked.put(id, value);
  }

  public void sweep() {
    idle.keySet().removeIf(key -> key.isEmpty());
    jobs.poll();
    if (peeked.isEmpty()) {
      return;
    }
  }

  public void share(String id, Object value) {
    SHARED.put(id, value);
  }
}
