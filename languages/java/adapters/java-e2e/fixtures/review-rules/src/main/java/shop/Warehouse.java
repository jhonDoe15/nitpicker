package shop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Warehouse {
  private static final Logger LOG = LoggerFactory.getLogger(Warehouse.class);
  private static final Pattern SKU = Pattern.compile("[A-Z]{3}-\\d+");
  private static final List<String> ZONES = List.of("north", "south");
  private static final ExecutorService WORKERS = Executors.newFixedThreadPool(2); // violation: ClassLoadEffect
  private static final Connection STOCK = connect("jdbc:h2:mem:stock");
  private static final Supplier<Connection> REPORTS = () -> connect("jdbc:h2:mem:reports");
  private static final boolean SEEDED;

  static {
    SEEDED = Files.exists(Path.of("seed.csv")); // violation: ClassLoadEffect
  }

  private Warehouse() {}

  static Connection connect(String url) {
    try {
      return DriverManager.getConnection(url); // violation: ClassLoadEffect
    } catch (SQLException error) {
      throw new IllegalStateException(error);
    }
  }

  static boolean accepts(String sku, String zone) {
    LOG.debug("Checking {} in {}", sku, zone);
    return SEEDED && SKU.matcher(sku).matches() && ZONES.contains(zone);
  }

  static Connection reports() {
    return REPORTS.get();
  }

  static ExecutorService workers() {
    return WORKERS;
  }

  static Connection stock() {
    return STOCK;
  }

  enum Ledger {
    MAIN;

    private final Connection connection;

    Ledger() {
      try {
        connection = DriverManager.getConnection("jdbc:h2:mem:ledger"); // violation: ClassLoadEffect
      } catch (SQLException error) {
        throw new IllegalStateException(error);
      }
    }

    Connection connection() {
      return connection;
    }
  }

  static final class Archive {
    private final boolean present;

    private Archive() {
      present = Files.isDirectory(Path.of("archive"));
    }

    static Archive instance() {
      return Holder.INSTANCE;
    }

    boolean present() {
      return present;
    }

    private static final class Holder {
      private static final Archive INSTANCE = new Archive();
    }
  }
}
