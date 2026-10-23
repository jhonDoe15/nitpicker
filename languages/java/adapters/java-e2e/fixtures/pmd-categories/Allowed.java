package demo;

import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class Allowed {
  private static final Allowed INSTANCE = new Allowed();
  private final ReentrantLock lock = new ReentrantLock();
  private final Condition changed = lock.newCondition();
  private volatile Object published;
  private boolean ready;

  public static Allowed instance() { return INSTANCE; }
  public String copy(String value) { return value; }
  public String built(StringBuilder text) { return text.toString(); }
  public void start(Thread worker) { worker.start(); }
  public SecretKeySpec key(byte[] externalKey) { return new SecretKeySpec(externalKey, "AES"); }
  public IvParameterSpec iv(SecureRandom random) {
    byte[] nonce = new byte[16];
    random.nextBytes(nonce);
    return new IvParameterSpec(nonce);
  }
  public List<Object> distinct(int count) {
    List<Object> values = new ArrayList<>();
    for (int i = 0; i < count; i++) { values.add(new Object()); }
    return values;
  }
  public Map<String, String> localMap(String value) {
    Map<String, String> values = new HashMap<>();
    values.put(value, value);
    return values;
  }
  public String describe(List<String> names) {
    StringBuilder text = new StringBuilder();
    for (String name : names) { text.append(name).append(", and more text than sixteen chars"); }
    return text.toString();
  }
  public String choice(int value) {
    return switch (value) { case 0 -> "zero"; default -> "other"; };
  }
  public InputStream open(Path file) throws IOException { return Files.newInputStream(file); }
  public InputStream stdin() { return new FileInputStream(FileDescriptor.in); }
  public Object published() { return published; }
  public String[] array(List<String> names) { return names.toArray(new String[0]); }
  public boolean blank(String value) { return value.isBlank(); }
  public String text(int value) { return String.valueOf(value); }
  public String label(int value) { return value + "x"; }
  public int position(String value) { return value.indexOf('x'); }
  public Instant now(Clock clock) { return Instant.now(clock); }
  public int[] copied(int[] values) {
    int[] copy = new int[values.length];
    System.arraycopy(values, 0, copy, 0, values.length);
    return copy;
  }
  public int[] reversed(int[] values) {
    int[] copy = new int[values.length];
    for (int i = 0; i < values.length; i++) { copy[i] = values[values.length - 1 - i]; }
    return copy;
  }
  public List<String> filtered(String[] names) {
    List<String> kept = new ArrayList<>();
    for (String name : names) {
      if (name.isEmpty()) { continue; }
      kept.add(name);
    }
    return kept;
  }
  public Set<String> all(String[] names) {
    Set<String> set = new HashSet<>();
    Collections.addAll(set, names);
    return set;
  }
  public void await() throws InterruptedException {
    lock.lock();
    try {
      while (!ready) { changed.await(); }
    } finally {
      lock.unlock();
    }
  }
  public void signal() {
    lock.lock();
    try {
      ready = true;
      changed.signalAll();
    } finally {
      lock.unlock();
    }
  }

  static class Worker extends Thread {
    @Override
    public void run() { super.run(); }
  }
}
