package shop.jobs

import org.springframework.kafka.annotation.KafkaListener
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import shop.orders.OrderLoader

@Component
class JobsAllowed(private val loader: OrderLoader) {
    private val failures = mutableListOf<String>()

    @Scheduled(cron = "0 0 3 * * *")
    fun isolated(ids: List<Long>) {
        for (id in ids) {
            try {
                loader.load(id)
            } catch (failed: RuntimeException) {
                failures.add("$id: ${failed.message}")
            }
        }
    }

    @Scheduled(fixedRate = 5000)
    fun isolatedByRunCatching(ids: List<Long>) {
        ids.forEach { id ->
            runCatching { loader.load(id) }.onFailure { failures.add("$id: ${it.message}") }
        }
    }

    @Scheduled(fixedRate = 5000)
    fun enqueueOnly(ids: List<Long>) {
        for (id in ids) {
            loader.placed(id)
        }
    }

    @Scheduled(fixedRate = 5000)
    fun countOnly(ids: List<Long>): Long {
        var total = 0L
        for (id in ids) {
            total += id
        }
        return total
    }

    @KafkaListener(topics = ["orders"])
    fun onOrder(id: Long) {
        loader.load(id)
    }

    fun notAJob(ids: List<Long>) {
        for (id in ids) {
            loader.load(id)
        }
    }
}
