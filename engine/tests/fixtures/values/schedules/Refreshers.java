package values.schedules;

import jakarta.persistence.EntityManager;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.data.repository.CrudRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestTemplate;

public class Refreshers {
    private final ScheduledExecutorService scheduler;
    private final JdbcTemplate jdbc;
    private final CrudRepository<Object, Long> repository;
    private final RestTemplate rest;
    private final EntityManager entityManager;
    private final ExecutorService pool;
    private final Socket socket;
    private final AtomicInteger ticks = new AtomicInteger();

    public Refreshers(ScheduledExecutorService scheduler, JdbcTemplate jdbc, CrudRepository<Object, Long> repository,
                      RestTemplate rest, EntityManager entityManager, ExecutorService pool, Socket socket) {
        this.scheduler = scheduler;
        this.jdbc = jdbc;
        this.repository = repository;
        this.rest = rest;
        this.entityManager = entityManager;
        this.pool = pool;
        this.socket = socket;
    }

    public void startUnsafe() {
        scheduler.scheduleAtFixedRate(() -> jdbc.update("delete from carts"),
                0, 30, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(() -> {
            ticks.incrementAndGet();
            rest.getForObject("http://stock/refresh", String.class);
        }, 0, 1, TimeUnit.MINUTES);
        scheduler.scheduleAtFixedRate(this::purge, 0, 1, TimeUnit.HOURS);
        scheduler.scheduleAtFixedRate(() -> entityManager.flush(),
                0, 1, TimeUnit.HOURS);
    }

    public void startSafe(Path marker) {
        scheduler.scheduleAtFixedRate(() -> {
            try {
                jdbc.update("delete from sessions");
            } catch (RuntimeException e) {
                ticks.set(-1);
            }
        }, 0, 30, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                repository.deleteAll();
            } catch (Exception e) {
                ticks.set(-1);
            }
        }, 0, 1, TimeUnit.MINUTES);
        scheduler.scheduleAtFixedRate(this::purgeGuarded, 0, 1, TimeUnit.HOURS);
        scheduler.scheduleAtFixedRate(ticks::incrementAndGet, 0, 1, TimeUnit.SECONDS);
        scheduler.scheduleAtFixedRate(() -> ticks.set(0), 0, 1, TimeUnit.SECONDS);
        ScheduledFuture<?> kept = scheduler.scheduleAtFixedRate(() -> jdbc.update("vacuum"), 0, 1, TimeUnit.DAYS);
        kept.cancel(false);
        scheduler.scheduleAtFixedRate(() -> CompletableFuture.runAsync(() -> jdbc.update("vacuum"), pool),
                0, 1, TimeUnit.MINUTES);
        scheduler.scheduleAtFixedRate(() -> pool.submit(() -> jdbc.update("vacuum")), 0, 1, TimeUnit.MINUTES);
        scheduler.scheduleWithFixedDelay(() -> {
            if (Files.exists(marker)) {
                ticks.set(0);
            }
        }, 0, 5, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(() -> {
            if (socket.isClosed()) {
                ticks.set(0);
            }
        }, 0, 5, TimeUnit.SECONDS);
        scheduler.scheduleAtFixedRate(() -> pool.execute(new Runnable() {
            @Override
            public void run() {
                jdbc.update("vacuum");
            }
        }), 0, 1, TimeUnit.MINUTES);
    }

    private void purge() {
        repository.deleteAll();
    }

    private void purgeGuarded() {
        try {
            repository.deleteAll();
        } catch (RuntimeException e) {
            ticks.set(-1);
        }
    }
}
