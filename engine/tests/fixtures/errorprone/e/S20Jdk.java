import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Scanner;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.LinkedTransferQueue;
import java.util.concurrent.PriorityBlockingQueue;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.io.InputStream;

class S20Jdk {
  static final String HOST = "example.com";
  static final String LOOP = "127.0.0.1";

  void addresses(String host) throws Exception {
    InetAddress.getByName("example.com");
    new Socket("example.com", 80);
    new InetSocketAddress("example.com", 80);
    new Socket(InetAddress.getLoopbackAddress(), 80);
    InetAddress.getAllByName("example.com");
    new InetSocketAddress(InetAddress.getLoopbackAddress(), 80);
    new Socket("localhost", 80);
    InetAddress.getByName("localhost");
    new InetSocketAddress("localhost", 80);
    new Socket("1.2.3.4", 80);
    InetAddress.getByName("2001:db8:85a3:8d3:1319:8a2e:370:7348");
    new InetSocketAddress("::ffff:192.0.2.128", 80);
    new Socket("127.0.0.1", 80);
    InetAddress.getByName("127.0.0.1");
    new InetSocketAddress("127.0.0.1", 80);
    new Socket("::1", 80);
    InetAddress.getByName("::1");
    new InetSocketAddress("::1", 80);
    InetAddress.getByName(host);
    new Socket(host, 80);
    InetAddress.getByName(HOST);
    InetAddress.getByName(LOOP);
    new Socket(LOOP, 80);
    new InetSocketAddress(HOST + ".org", 80);
    InetAddress.getByName("");
    InetAddress.getByName("1abc");
    InetAddress.getByName("abc1");
    InetAddress.getByName("1abc1");
    InetAddress.getByName("host" + 1);
    new Socket("example.com", 80) {};
    new InetSocketAddress(8080);
  }

  @SuppressWarnings("AddressSelection")
  void suppressedAddress() throws Exception {
    InetAddress.getByName("example.com");
  }

  String scanners(InputStream in, Scanner scanner) {
    String a = new Scanner(in).useDelimiter("\\A").next();
    String b = scanner.useDelimiter("\\A").next();
    String c = scanner.useDelimiter("\\Z").next();
    String d = scanner.useDelimiter("\\" + "A").next();
    String e = scanner.useDelimiter(java.util.regex.Pattern.compile("\\A")).next();
    return a + b + c + d + e;
  }

  void pools(int n) {
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
    new ThreadPoolExecutor(0, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingDeque<>());
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<Runnable>(java.util.List.of()));
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedTransferQueue<>());
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new PriorityBlockingQueue<>());
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new PriorityBlockingQueue<>(11));
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>(5));
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(5));
    new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
    new ThreadPoolExecutor(0, 1, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
    new ThreadPoolExecutor(n, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
    new ThreadPoolExecutor(2 + 3, 20, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>(), (java.util.concurrent.ThreadFactory) Thread::new);
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>() {});
  }

  @SuppressWarnings("ErroneousThreadPoolConstructorChecker")
  void suppressedPool() {
    new ThreadPoolExecutor(1, 10, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());
  }

  @SuppressWarnings("deprecation")
  void dates(Date date) {
    new Date(2020, 1, 1);
    new Date(120, 0, 1);
    new Date(120, 11, 31);
    new Date(120, 12, 31);
    new Date(120, 0, 32);
    new Date(120, 0, 0);
    new Date(120, -1, 5);
    new Date(0, 0, 1);
    new Date(301, 5, 5);
    new Date(120, 0, 1, 24, 0);
    new Date(120, 0, 1, 23, 60);
    new Date(120, 0, 1, 23, 59);
    new Date(120, 0, 1, 25, 61, 62);
    new Date(120, 0, 1, 12, 30, 59);
    new Date(2020, 12, 40, 30, 70, 80);
    new Date(120, 5, 1);
    new Date(120, 11, 1, 0, 0);
    new Date(120, 1 + 1, 1);
    new Date(120, (3), 1);
    new Date(100L);
    new Date();
    new Date("Jan 1, 2020");
    date.setYear(2020);
    date.setYear(120);
    date.setMonth(12);
    date.setMonth(3);
    date.setMonth(-3);
    date.setDate(0);
    date.setDate(15);
    date.setHours(24);
    date.setHours(23);
    date.setMinutes(60);
    date.setMinutes(0);
    date.setSeconds(61);
    date.setSeconds(5);
    date.setTime(5);
    date.setYear(date.getYear());
    new java.sql.Date(5L).setMonth(12);
  }

  @SuppressWarnings({"deprecation", "DateChecker"})
  void suppressedDates() {
    new Date(2020, 1, 1);
  }

  static final String PATTERN = "yyyy-MM-dd yy";

  void formats(SimpleDateFormat format, boolean b) {
    new SimpleDateFormat("yyyy-MM-dd");
    new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ");
    new SimpleDateFormat("yyyy MM dd yyyy");
    new SimpleDateFormat("yyyy-MM-dd hh:mm:ss hh:mm");
    new SimpleDateFormat("yyyy-MM-dd HH:mm:ss HH");
    new SimpleDateFormat("yyyy-MM-dd hh:mm:ss a a");
    new SimpleDateFormat("dd'dd'MM mm mm");
    new SimpleDateFormat("yyyy 'yyyy' MM dd");
    new SimpleDateFormat("y y MM");
    new SimpleDateFormat("yyyy[ yyyy] MM");
    new SimpleDateFormat("mm dd MM mm dd");
    new SimpleDateFormat(PATTERN);
    new SimpleDateFormat("yyyyyyy-MM-dd");
    new SimpleDateFormat("yyyy-yy");
    new SimpleDateFormat("''yyyy yyyy");
    new SimpleDateFormat("yyyy-MM-dd yyyy", java.util.Locale.ROOT);
    format.applyPattern("hh:mm hh");
    format.applyLocalizedPattern("MM MM");
    java.time.format.DateTimeFormatter.ofPattern("yyyy yyyy");
    java.time.format.DateTimeFormatter.ofPattern("yyyy-MM");
    new SimpleDateFormat(b ? "yyyy yyyy" : "yyyy");
  }

  @SuppressWarnings("DuplicateDateFormatField")
  void suppressedFormat() {
    new SimpleDateFormat("yyyy yyyy");
  }
}
