package fwd;

public class Backend {
  public String fetch(String id, int retries) {
    return id + retries;
  }

  public String fetchSwapped(int retries, String id) {
    return id + retries;
  }

  public void send(String id) {}

  public int size() {
    return 0;
  }

  public String load(String id) {
    return id;
  }

  public String load(String id, int retries) {
    return id + retries;
  }

  public String render(Context context, String id) {
    return context.name() + id;
  }
}
