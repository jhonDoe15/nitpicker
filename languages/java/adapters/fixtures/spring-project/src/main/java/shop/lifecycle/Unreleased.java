package shop.lifecycle;

import jakarta.annotation.PostConstruct;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import java.util.Map;
import java.util.Timer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

@Service
public class Unreleased {
  private final ExecutorService workers = Executors.newFixedThreadPool(4); // violation: SpringUnreleasedResource
  private final ScheduledExecutorService ticks; // violation: SpringUnreleasedResource
  private final ExecutorService queue = // violation: SpringUnreleasedResource
      new ThreadPoolExecutor(1, 4, 1, TimeUnit.MINUTES, new LinkedBlockingQueue<>(100));
  private final Timer timer = new Timer("audit"); // violation: SpringUnreleasedResource
  private final ExecutorService wrapped = // violation: SpringUnreleasedResource
      Executors.unconfigurableExecutorService(Executors.newSingleThreadExecutor());
  private Thread poller; // violation: SpringUnreleasedResource, SpringImmutableBeans
  private EventLoopGroup loops; // violation: SpringUnreleasedResource, SpringImmutableBeans

  public Unreleased() {
    this.ticks = Executors.newSingleThreadScheduledExecutor();
  }

  @PostConstruct
  void start() {
    poller = new Thread(this::poll);
    poller.start();
    loops = new NioEventLoopGroup(2);
  }

  public void submit(Runnable task) {
    workers.execute(task);
    queue.execute(task);
    wrapped.execute(task);
    ticks.schedule(task, 1, TimeUnit.SECONDS);
    timer.purge();
    loops.execute(task);
  }

  private void poll() {
    workers.execute(() -> { });
  }

  public void shutdown() {
    workers.shutdown();
  }
}

@Component
class KafkaClients {
  private final AdminClient admin = AdminClient.create(Map.of()); // violation: SpringUnreleasedResource
  private final KafkaConsumer<String, String> consumer; // violation: SpringUnreleasedResource
  private final ThreadPoolTaskExecutor tasks = new ThreadPoolTaskExecutor(); // violation: SpringUnreleasedResource

  KafkaClients() {
    this.consumer = new KafkaConsumer<>(Map.<String, Object>of());
    tasks.initialize();
  }

  int topics() throws Exception {
    tasks.execute(consumer::wakeup);
    return admin.listTopics().names().get().size();
  }
}

@Configuration(proxyBeanMethods = false)
class CleanupHelperOnly {
  private final ExecutorService pool = Executors.newCachedThreadPool(); // violation: SpringUnreleasedResource

  void run(Runnable task) {
    pool.execute(task);
  }

  void close() {
    pool.shutdown();
  }
}
