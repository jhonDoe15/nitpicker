package shop.jobs

import io.awspring.cloud.sqs.annotation.SqsListener
import org.quartz.Job
import org.quartz.JobExecutionContext
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import shop.orders.OrderLoader
import shop.orders.OrderRepository

@Component
class NightlyJobs(private val loader: OrderLoader, private val orders: OrderRepository) : Job {
    @Scheduled(cron = "0 0 3 * * *")
    fun closeOrders() {
        for (order in orders.findAll()) {
            loader.load(order.id)
        }
    }

    @Scheduled(fixedRate = 5000)
    fun refreshPrices(ids: List<Long>) {
        for (id in ids) {
            loader.price(id)
        }
    }

    @Scheduled(fixedRate = 5000)
    fun reloadEach(ids: List<Long>) {
        ids.forEach { loader.load(it) }
    }

    @Scheduled(fixedRate = 5000)
    fun rethrown(ids: List<Long>) {
        for (id in ids) {
            try {
                loader.load(id)
            } catch (failed: RuntimeException) {
                throw IllegalStateException(failed)
            }
        }
    }

    @KafkaListener(topics = ["orders"])
    fun onBatch(ids: List<Long>) {
        for (id in ids) {
            orders.deleteById(id)
        }
    }

    @SqsListener("orders")
    fun onMessages(ids: List<Long>) {
        for (id in ids) {
            loader.load(id)
        }
    }

    override fun execute(context: JobExecutionContext) {
        for (order in orders.findAll()) {
            loader.load(order.id)
        }
    }
}
