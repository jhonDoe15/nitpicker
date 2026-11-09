package shop;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "shop.mail")
public class MailProperties {
    private String host;
    private final Retry retry = new Retry();

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public Retry getRetry() {
        return retry;
    }

    public static class Retry {
        private int maxAttempts;

        public int getMaxAttempts() {
            return maxAttempts;
        }

        public void setMaxAttempts(int maxAttempts) {
            this.maxAttempts = maxAttempts;
        }
    }
}
