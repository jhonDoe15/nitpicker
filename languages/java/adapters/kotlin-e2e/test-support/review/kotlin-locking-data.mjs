const MAIN = 'src/main/kotlin/demo/orders';

const TRANSFERS = `package demo.orders

import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.concurrent.withLock as guarded
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class Transfers {
    private val accounts = Any()
    private val audit = Any()
    private val ledger = ReentrantLock()
    private val journal = ReentrantLock()
    private val mutex = Mutex()
    private val gate = Mutex()
    private var moved = 0L

    fun transfer() {
        synchronized(accounts) {
            synchronized(audit) { moved += 1 }
        }
    }

    fun report() {
        synchronized(this.audit) {
            synchronized(accounts) { moved = 0 }
        }
    }

    fun post() {
        ledger.withLock { journal.guarded { moved += 2 } }
    }

    @Synchronized
    fun close() {
        journal.withLock { ledger.withLock { moved -= 2 } }
    }

    fun inspect() {
        journal.withLock { synchronized(this) { moved *= 2 } }
    }

    suspend fun drain() {
        mutex.withLock { gate.withLock { moved = 3 } }
        gate.withLock { mutex.withLock { moved = 4 } }
    }

    fun share() {
        synchronized(Registry.LOCK) { synchronized(audit) { moved += 5 } }
    }

    fun unshare() {
        synchronized(audit) { synchronized(Registry.LOCK) { moved -= 5 } }
    }
}

object Registry {
    val LOCK = Any()
}
`;

const ORDERED = `package demo.orders

import kotlin.concurrent.thread

class Ordered {
    private val first = Any()
    private val second = Any()
    private val third = Any()
    private val fourth = Any()
    private val fifth = Any()
    private var count = 0

    fun add() {
        synchronized(first) { synchronized(second) { count += 1 } }
    }

    fun remove() {
        synchronized(this.first) { synchronized(second) { count -= 1 } }
    }

    fun single() {
        synchronized(second) { count *= 1 }
    }

    fun again() {
        synchronized(first) { synchronized(first) { count += 2 } }
    }

    fun passed(outer: Any) {
        synchronized(outer) { synchronized(first) { count += 3 } }
    }

    fun passedBack(outer: Any) {
        synchronized(first) { synchronized(outer) { count -= 3 } }
    }

    fun local() {
        val second = Any()
        synchronized(second) { synchronized(first) { count += 4 } }
    }

    fun later() {
        synchronized(second) { thread { synchronized(first) { count -= 4 } } }
    }

    fun third() {
        synchronized(third) { synchronized(first) { count += 5 } }
    }

    fun reenter() {
        synchronized(fourth) { synchronized(fifth) { synchronized(fourth) { count *= 3 } } }
    }
}
`;

const COUNTERS = `package demo.orders

import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class Counters(var size: Int) {
    private val lock = Any()
    private val guard = ReentrantLock()
    private val explicit = ReentrantLock()
    private var count = 0
    @Volatile private var hits = 0
    @Volatile private var running = false
    private var total = 0L
    private var label = ""
    private var helped = 0
    private var atomic = AtomicLong()
    private var spare = 0
    @Volatile private var owner = ""

    init {
        count = 1
    }

    fun increment() {
        synchronized(lock) {
            count++
            hits++
            running = true
            atomic = AtomicLong(1)
            help()
        }
    }

    fun bump() {
        count++
    }

    fun reset() {
        this.count = 0
        hits += 1
        running = false
        atomic = AtomicLong(2)
    }

    fun add(amount: Long) {
        guard.withLock { total += amount }
    }

    fun clear() {
        total = 0
    }

    fun addExplicit(amount: Long) {
        explicit.lock()
        try {
            total += amount
        } finally {
            explicit.unlock()
        }
    }

    fun claim(owner: String) {
        synchronized(lock) { this.owner = owner + "!" }
    }

    fun release(owner: String) {
        this.owner = owner
    }

    @Synchronized
    fun name(value: String) {
        label = value
        size = value.length
    }

    fun rename(value: String) {
        label = value
    }

    fun resize(value: Int) {
        size = value
    }

    private fun help() {
        helped += 1
    }

    fun helpAgain() {
        synchronized(lock) { helped = 0 }
    }

    fun later(tasks: MutableList<() -> Unit>) {
        tasks.add { count = 2 }
    }

    fun shadow() {
        var count = 1
        count += 1
        spare = count
    }

    fun spareAgain() {
        spare = 0
    }

    fun summary(): String = synchronized(lock) { "$label $total $helped $spare $size $count $hits $running $atomic $owner" }
}
`;

export const LOCKING_FILES = {
  [`${MAIN}/Transfers.kt`]: TRANSFERS,
  [`${MAIN}/Ordered.kt`]: ORDERED,
  [`${MAIN}/Counters.kt`]: COUNTERS,
};

export const LOCKING_FINDINGS = [
  'InconsistentFieldLocking Counters.count in bump',
  'InconsistentFieldLocking Counters.count in reset',
  'InconsistentFieldLocking Counters.hits in reset',
  'InconsistentFieldLocking Counters.label in rename',
  'InconsistentFieldLocking Counters.size in resize',
  'InconsistentFieldLocking Counters.total in clear',
  'InconsistentFieldLocking Ledger.total in add',
  'InconsistentFieldLocking Ledger.total in addAccumulated',
  'InconsistentFieldLocking Ledger.total in addAfterAwaiting',
  'InconsistentFieldLocking Ledger.total in addFromSaved',
  'LockOrderInversion Transfers.close: journal -> ledger',
  'LockOrderInversion Transfers.close: this -> journal',
  'LockOrderInversion Transfers.drain: gate -> mutex',
  'LockOrderInversion Transfers.drain: mutex -> gate',
  'LockOrderInversion Transfers.inspect: journal -> this',
  'LockOrderInversion Transfers.post: ledger -> journal',
  'LockOrderInversion Transfers.report: audit -> accounts',
  'LockOrderInversion Transfers.share: Registry.LOCK -> audit',
  'LockOrderInversion Transfers.transfer: accounts -> audit',
  'LockOrderInversion Transfers.unshare: audit -> Registry.LOCK',
];
