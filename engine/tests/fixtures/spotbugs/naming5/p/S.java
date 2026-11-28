package p;

public class S {
    record StateOrException(String state, Exception exception) {
        StateOrException {
            if (state != null && exception != null) {
                throw new IllegalArgumentException("both");
            }
        }
    }
    public static class StatusOrException {
        private final String status;
        private final Exception exception;
        public StatusOrException(String status) { this.status = status; this.exception = null; }
        public StatusOrException(Exception exception) { this.status = null; this.exception = exception; }
        public String getStatus() { return status; }
        public Exception getException() { return exception; }
    }
    public static class PlainException {
        private final String status;
        public PlainException(String status) { this.status = status; }
        public String getStatus() { return status; }
    }
}
