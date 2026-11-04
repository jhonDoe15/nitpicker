package app;

public interface Repo {
  void save(String value);

  String load(String key);
}
