const HEADER = `package shop.perf;

import jakarta.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class Wide {
  private final RestClient client = RestClient.create();
  private final Map<String, Integer> cache = new HashMap<>();
  private final Map<String, Integer> other = new HashMap<>();
  private final Object lock = new Object();
  private long total;

  @PostConstruct
  void init() {
    warm();
    client.get();
  }

  private void warm() {
    cache.put("warm", 1);
  }
`;

function method(index: number): string {
  const previous = Math.max(1, index - 1);
  return `
  public int work${String(index)}(int a, long timeoutMillis, long delaySeconds) {
    synchronized (lock) {
      total += a;
    }
    total++;
    int x = helper${String(index)}(a);
    cache.put("k${String(index)}", x);
    other.get("z");
    long t = timeoutMillis + delaySeconds;
    return x + (int) TimeUnit.SECONDS.toMillis(delaySeconds)
        + work${String(previous)}(a, timeoutMillis, delaySeconds);
  }

  private int helper${String(index)}(int a) {
    return a + ${String(index)};
  }
`;
}

export function syntheticSpringClass(methods: number): string {
  const body = Array.from({ length: methods }, (_, index) => method(index + 1)).join('');
  return `${HEADER}${body}}\n`;
}
