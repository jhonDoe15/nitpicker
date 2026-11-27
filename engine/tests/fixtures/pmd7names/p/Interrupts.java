package p;

import java.util.concurrent.Callable;
import java.util.concurrent.TimeoutException;

public class Interrupts {
    public Object restored(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    public Object negated(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (!(e instanceof InterruptedException)) {
                return null;
            }
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    public Object negatedElse(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (!(e instanceof InterruptedException)) {
                return null;
            } else {
                Thread.currentThread().interrupt();
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    public Object negatedFallsThrough(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (!(e instanceof InterruptedException)) {
                System.out.println(e);
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    public Object negatedElseSwallows(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (!(e instanceof InterruptedException)) {
                Thread.currentThread().interrupt();
            } else {
                return null;
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    public Object negatedLogsOther(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (!(e instanceof InterruptedException)) {
                System.out.println(e);
            } else {
                Thread.currentThread().interrupt();
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    public Object negatedOther(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (!(e instanceof TimeoutException)) {
                return null;
            }
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    public Object swallowed(Callable<Object> task) {
        try {
            return task.call();
        } catch (InterruptedException | TimeoutException e) {
            if (e instanceof TimeoutException) {
                return null;
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }
}
