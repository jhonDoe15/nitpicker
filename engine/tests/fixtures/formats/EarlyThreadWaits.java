package fixtures;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

class EarlyThreadWaits {
    private final List<String> shared = new ArrayList<>();

    int processExit(List<String> files) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder("make");
        Process build = builder.start();
        int code = build.waitFor();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return code + names.size() + sizes;
    }

    boolean processTimed(List<String> files) throws IOException, InterruptedException {
        Process build = Runtime.getRuntime().exec(new String[] {"make"});
        boolean ended = build.waitFor(5, TimeUnit.SECONDS);
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return ended && names.size() > sizes;
    }

    int processOutputReadBetween(List<String> files) throws IOException, InterruptedException {
        Process build = new ProcessBuilder("make").start();
        int code = build.waitFor();
        String output = new String(build.getInputStream().readAllBytes());
        int sizes = measureAll(files);
        return code + output.length() + sizes;
    }

    int processUsedRightAway(List<String> files) throws IOException, InterruptedException {
        Process build = new ProcessBuilder("make").start();
        int code = build.waitFor();
        List<String> names = listNames(List.of(String.valueOf(code)));
        int sizes = measureAll(files);
        return code + names.size() + sizes;
    }

    String threadJoin(List<String> files) throws InterruptedException {
        AtomicReference<String> report = new AtomicReference<>();
        Thread worker = new Thread(() -> report.set(String.join(",", files)));
        worker.start();
        worker.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report.get(), names, sizes);
    }

    String virtualThreadJoin(List<String> others) throws InterruptedException {
        List<String> found = new ArrayList<>();
        Thread worker = Thread.startVirtualThread(() -> found.add("x"));
        worker.join();
        List<String> names = listNames(others);
        int sizes = measureAll(others);
        return merge(found.get(0), names, sizes);
    }

    String threadNeverStarted(List<String> files) throws InterruptedException {
        AtomicReference<String> report = new AtomicReference<>();
        Thread worker = new Thread(() -> report.set(String.join(",", files)));
        worker.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report.get(), names, sizes);
    }

    String threadWritesField(List<String> files) throws InterruptedException {
        AtomicReference<String> report = new AtomicReference<>();
        Thread worker = new Thread(() -> shared.add(report.get()));
        worker.start();
        worker.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report.get(), names, sizes);
    }

    String threadCallsOwnMethod(List<String> files) throws InterruptedException {
        AtomicReference<String> report = new AtomicReference<>();
        Thread worker = new Thread(() -> report.set(buildReport(files)));
        worker.start();
        worker.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report.get(), names, sizes);
    }

    String threadResultUsedRightAway(List<String> files) throws InterruptedException {
        AtomicReference<String> report = new AtomicReference<>();
        Thread worker = new Thread(() -> report.set(String.join(",", files)));
        worker.start();
        worker.join();
        String text = report.get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(text, names, sizes);
    }

    String threadWithoutCapturedLocal(List<String> files) throws InterruptedException {
        Thread worker = new Thread(() -> System.out.println("x"));
        worker.start();
        worker.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge("", names, sizes);
    }

    String flushThread(List<String> files) throws InterruptedException {
        List<String> found = new ArrayList<>();
        Thread flushWorker = new Thread(() -> found.add("x"));
        flushWorker.start();
        flushWorker.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(found.get(0), names, sizes);
    }

    private String buildReport(List<String> files) {
        return String.join(",", files);
    }

    private List<String> listNames(List<String> files) {
        return files;
    }

    private int measureAll(List<String> files) {
        return files.size();
    }

    private String merge(String report, List<String> names, int sizes) {
        return report + names + sizes;
    }
}
