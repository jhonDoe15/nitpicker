package shop.jobs;

import io.awspring.cloud.sqs.annotation.SqsListener;
import java.util.List;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import shop.orders.Order;
import shop.orders.OrderLoader;
import shop.orders.OrderRepository;
import shop.prices.PriceSource;

@Component
public class NightlyJobs implements Job {
  private final OrderLoader loader;
  private final OrderRepository orders;
  private final PriceSource prices;

  public NightlyJobs(OrderLoader loader, OrderRepository orders, PriceSource prices) {
    this.loader = loader;
    this.orders = orders;
    this.prices = prices;
  }

  @Scheduled(cron = "0 0 3 * * *")
  public void closeOrders() {
    for (Order order : orders.findAll()) {
      loader.load(order.getId());
    }
  }

  @Scheduled(fixedDelay = 60_000)
  public void refreshPrices(List<Long> ids) {
    for (Long id : ids) {
      prices.priceOf(id);
    }
  }

  @Scheduled(fixedRate = 5_000)
  public void reloadEach(List<Long> ids) {
    ids.forEach(id -> loader.load(id));
  }

  @Scheduled(fixedRate = 5_000)
  public void sweepAll(List<Long> ids) {
    sweep(ids);
  }

  private void sweep(List<Long> ids) {
    for (Long id : ids) {
      orders.deleteById(id);
    }
  }

  @Scheduled(fixedRate = 5_000)
  public void rethrown(List<Long> ids) {
    for (Long id : ids) {
      try {
        loader.load(id);
      } catch (RuntimeException failed) {
        throw new IllegalStateException(failed);
      }
    }
  }

  @Scheduled(fixedRate = 5_000)
  public void wholeLoop(List<Long> ids) {
    try {
      for (Long id : ids) {
        loader.load(id);
      }
    } catch (RuntimeException failed) {
      ids.clear();
    }
  }

  @KafkaListener(topics = "orders")
  public void onBatch(List<Long> ids) {
    for (Long id : ids) {
      orders.deleteById(id);
    }
  }

  @SqsListener("orders")
  public void onMessages(List<Long> ids) {
    for (Long id : ids) {
      loader.load(id);
    }
  }

  @Override
  public void execute(JobExecutionContext context) {
    for (Order order : orders.findAll()) {
      loader.load(order.getId());
    }
  }
}
