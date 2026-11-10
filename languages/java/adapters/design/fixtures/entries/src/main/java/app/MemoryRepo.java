package app;

public class MemoryRepo implements Repo {
  public void save(String value) {}

  @Override
  public String load(String key) {
    return key;
  }

  public void helper() {}
}
