package p;

import java.util.Map;

public class A {
    private final Map<String, String> rawConfig;
    private Map<String, String> transformedConfig;

    public A(Map<String, String> rawConfig) {
        this.rawConfig = rawConfig;
    }

    public synchronized void transform() {
        transformedConfig = rawConfig;
    }

    public void plain() {
        transformedConfig = rawConfig;
    }

    public Map<String, String> get() {
        return transformedConfig;
    }
}
