package p;

import java.util.List;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public class Rounds {
    private Seg[] segments = new Seg[2];
    private Lock[] locks = new Lock[2];
    private List<Seg> segList;
    private Seg seg = new Seg();
    private int n;

    static final class Seg {
        final Lock readLock = new ReentrantLock();
        Seg next;
    }

    Object make() {
        return new ReentrantLock();
    }

    void index(List<String> xs) {
        for (int i = 0; i < segments.length; i++) {
            Seg segment = segments[i];
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void eachArray(List<String> xs, Seg[] arr) {
        for (Seg segment : arr) {
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void eachIterable(List<String> xs, List<Seg> l) {
        for (Seg segment : l) {
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void constantIndex(List<String> xs) {
        for (int i = 0; i < segments.length; i++) {
            Seg segment = segments[0];
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void callByIndex(List<String> xs) {
        for (int i = 0; i < 2; i++) {
            Seg segment = segList.get(i);
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void direct(List<String> xs) {
        for (int i = 0; i < 2; i++) {
            segments[i].readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segments[i].readLock.unlock();
            }
        }
    }

    void fieldEachRound(List<String> xs, boolean b) {
        while (b) {
            Seg segment = seg;
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void lockItself(List<String> xs) {
        for (Lock l : locks) {
            l.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                l.unlock();
            }
        }
    }

    void alias(List<String> xs) {
        for (Seg segment : segments) {
            Lock l = segment.readLock;
            l.lock();
            try {
                for (String x : xs) {
                    work();
                }
            } finally {
                l.unlock();
            }
        }
    }

    void branchOnly(boolean b) {
        for (Seg segment : segments) {
            segment.readLock.lock();
            try {
                if (b) {
                    work();
                }
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void doWhile(boolean b) {
        for (Seg segment : segments) {
            segment.readLock.lock();
            try {
                do {
                    work();
                } while (b);
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void inLambda(List<String> xs) {
        for (Seg segment : segments) {
            segment.readLock.lock();
            try {
                xs.forEach(x -> {
                    for (int k = 0; k < 2; k++) {
                        work();
                    }
                });
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void linked(List<String> xs) {
        Seg segment = seg;
        while (segment != null) {
            segment.readLock.lock();
            for (String x : xs) {
                work();
            }
            segment.readLock.unlock();
            segment = segment.next;
        }
    }

    void loopBefore(List<String> xs) {
        for (Seg segment : segments) {
            for (String x : xs) {
                work();
            }
            segment.readLock.lock();
            try {
                work();
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void returns(List<String> xs) {
        for (Seg segment : segments) {
            segment.readLock.lock();
            try {
                for (String x : xs) {
                    work();
                }
                return;
            } finally {
                segment.readLock.unlock();
            }
        }
    }

    void work() {
        n--;
    }
}
