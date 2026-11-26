package fixtures;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

class EarlyWaits {
    private final ExecutorService executor;

    EarlyWaits(ExecutorService executor) {
        this.executor = executor;
    }

    String collect(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String joined(List<String> files) {
        CompletableFuture<String> reportJob = CompletableFuture.supplyAsync(() -> buildReport(files));
        String report = reportJob.join();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String timed(List<String> files) throws InterruptedException, ExecutionException, TimeoutException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get(5, TimeUnit.SECONDS);
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String usedRightAway(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get();
        List<String> names = listNames(List.of(report));
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String movedLate(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        String report = reportJob.get();
        return merge(report, names, sizes);
    }

    String cheapBetween(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get();
        int a = 1;
        int b = 2;
        return merge(report, List.of(), a + b);
    }

    String earlyExit(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get();
        if (files.isEmpty()) {
            return "";
        }
        List<String> names = listNames(files);
        return merge(report, names, 0);
    }

    String inTry(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        try {
            String report = reportJob.get();
            List<String> names = listNames(files);
            int sizes = measureAll(files);
            return merge(report, names, sizes);
        } finally {
            reportJob.cancel(true);
        }
    }

    String createdInPlace(List<String> files) throws InterruptedException, ExecutionException {
        String report = executor.submit(() -> buildReport(files)).get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String startupWait(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> ready = executor.submit(() -> buildReport(files));
        String server = ready.get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(server, names, sizes);
    }

    String blockJobNamedLikeWord(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> blockJob = executor.submit(() -> buildReport(files));
        String report = blockJob.get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String childExitedWait(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> childExited = executor.submit(() -> buildReport(files));
        String report = childExited.get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String joinedInTurn(List<String> files) {
        CompletableFuture<String> first = CompletableFuture.supplyAsync(() -> buildReport(files));
        CompletableFuture<String> second = CompletableFuture.supplyAsync(() -> buildReport(files));
        CompletableFuture<String> third = CompletableFuture.supplyAsync(() -> buildReport(files));
        String a = first.join();
        String b = second.join();
        String c = third.join();
        return a + b + c;
    }

    String alreadyDone(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = CompletableFuture.completedFuture("x");
        String report = reportJob.get();
        List<String> names = listNames(files);
        int sizes = measureAll(files);
        return merge(report, names, sizes);
    }

    String cheapWork(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get();
        int a = Math.max(1, 2);
        int b = Math.min(a, 3);
        return merge(report, files, a + b);
    }

    String taskUsedBetween(List<String> files) throws InterruptedException, ExecutionException {
        Future<String> reportJob = executor.submit(() -> buildReport(files));
        String report = reportJob.get();
        List<String> names = listNames(files);
        boolean done = reportJob.isDone();
        return merge(report, names, done ? 1 : 0);
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
