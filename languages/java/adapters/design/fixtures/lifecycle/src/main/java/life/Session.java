package life;

public class Session implements AutoCloseable {
  public void begin() {}

  public void write(String row) {}

  public void commit() {}

  public void rollback() {}

  @Override
  public void close() {}
}
