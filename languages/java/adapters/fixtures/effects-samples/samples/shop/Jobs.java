package shop;

import io.awspring.cloud.sqs.annotation.SqsListener;
import java.util.List;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;

class Jobs implements Job {
  private final OrderRepository orders;

  Jobs(OrderRepository orders) {
    this.orders = orders;
  }

  @Scheduled(cron = "0 0 3 * * *")
  void closeAll(List<Long> ids) {
    for (Long id : ids) {
      orders.findById(id);
    }
  }

  @Scheduled(cron = "0 0 3 * * *")
  void closeUntilFailure(List<Long> ids) {
    for (Long id : ids) {
      try {
        orders.findById(id);
      } catch (RuntimeException failed) {
        break;
      }
    }
  }

  @Scheduled(cron = "0 0 3 * * *")
  void closeEach(List<Long> ids) {
    for (Long id : ids) {
      try {
        orders.findById(id);
      } catch (RuntimeException failed) {
        ids.remove(id);
      }
    }
  }

  @KafkaListener(topics = "orders")
  void onBatch(List<Long> ids) {
    for (Long id : ids) {
      orders.save(new Order());
    }
  }

  @KafkaListener(topics = "orders")
  void onOne(Long id) {
    for (int attempt = 0; attempt < 2; attempt++) {
      orders.save(new Order());
    }
  }

  @SqsListener("orders")
  void onMessages(List<Long> ids) {
    for (Long id : ids) {
      orders.save(new Order());
    }
  }

  @Override
  public void execute(JobExecutionContext context) {
    for (Order order : orders.findAll()) {
      orders.delete(order);
    }
  }

  void notAJob(List<Long> ids) {
    for (Long id : ids) {
      orders.findById(id);
    }
  }
}
