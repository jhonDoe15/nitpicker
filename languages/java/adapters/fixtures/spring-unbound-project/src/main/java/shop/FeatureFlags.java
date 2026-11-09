package shop;

import org.springframework.beans.factory.annotation.Value;

public class FeatureFlags {
    private final boolean enabled;

    public FeatureFlags(@Value("${shop.feature-flag:false}") boolean enabled) {
        this.enabled = enabled;
    }

    public boolean enabled() {
        return enabled;
    }
}
