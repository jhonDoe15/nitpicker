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
