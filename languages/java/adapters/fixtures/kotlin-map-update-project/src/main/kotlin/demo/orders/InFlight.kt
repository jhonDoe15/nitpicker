package demo.orders

import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap

class InFlight {
    private val inProgress = ConcurrentHashMap<String, CompletableFuture<String>>()
    private val counts = HashMap<String, Int>()
    private val seen: MutableMap<String, Int> = mutableMapOf()
    private val pending: ConcurrentMap<String, Int> = ConcurrentHashMap()

    fun nested(key: String): CompletableFuture<String> =
        inProgress.computeIfAbsent(key) { k ->
            CompletableFuture.supplyAsync { load(k) }
                .whenComplete { _, _ -> inProgress.remove(k) }
        }

    fun allowed(key: String): CompletableFuture<String> {
        val started = inProgress.computeIfAbsent(key) { k -> CompletableFuture.supplyAsync { load(k) } }
        started.whenComplete { _, _ -> inProgress.remove(key, started) }
        return started
    }

    fun direct(key: String): Int = counts.computeIfAbsent(key) { counts.put("other", 1) ?: 0 }

    fun indexed(key: String): Int? = counts.compute(key) { _, value ->
        counts["other"] = 1
        value
    }

    fun views(key: String): Int? = counts.merge(key, 1) { a, b ->
        this.counts.keys.remove("stale")
        a + b
    }

    fun minus(key: String): Int? = counts.computeIfPresent(key) { _, v ->
        counts -= "stale"
        v
    }

    fun getOrPutConcurrent(key: String): CompletableFuture<String> = inProgress.getOrPut(key) {
        CompletableFuture.supplyAsync { load(key) }.whenComplete { _, _ -> inProgress.remove(key) }
    }

    fun getOrPutDeclared(key: String): Int = pending.getOrPut(key) {
        pending.remove("old")
        1
    }

    fun getOrPutPlain(key: String): Int = seen.getOrPut(key) {
        seen.remove("old")
        1
    }

    fun reference(key: String): CompletableFuture<String> = inProgress.computeIfAbsent(key, ::startAndForget)

    fun helper(key: String): CompletableFuture<String> = inProgress.computeIfAbsent(key) { startAndForget(it) }

    fun otherMap(key: String): Int = seen.computeIfAbsent(key) { counts.remove(it) ?: 0 }

    fun readOnly(key: String): Int = counts.computeIfAbsent(key) { counts.getOrDefault("base", 0) + counts.size }

    fun local(key: String): Int? {
        val cache = HashMap<String, Int>()
        return cache.computeIfPresent(key) { k, _ -> cache.remove(k) }
    }

    fun shadowed(key: String): Int {
        val counts = HashMap<String, Int>()
        return counts.computeIfAbsent(key) { bump(it) }
    }

    fun keyExpression(key: String) {
        counts.computeIfAbsent(counts.remove(key).toString()) { 1 }
    }

    private fun bump(k: String): Int = counts.put(k, 1) ?: 0

    private fun startAndForget(key: String): CompletableFuture<String> =
        CompletableFuture.supplyAsync { load(key) }.whenComplete { _, _ -> inProgress.remove(key) }

    private fun load(key: String): String = key
}
