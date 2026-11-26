import java.util.function.Predicate;
import org.testng.IRetryAnalyzer;
import org.testng.ITestResult;

class Retries {
    IRetryAnalyzer lambda = result -> result.getStatus() == ITestResult.FAILURE;

    IRetryAnalyzer reference = Retries::again;

    Predicate<ITestResult> other = result -> false;

    static boolean again(ITestResult result) {
        return false;
    }
}
