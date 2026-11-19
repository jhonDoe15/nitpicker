import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects } from '../test-support/temp-projects.mts';
import { readFixedDelayFindings as read } from './fixed-delays.mts';

const projectWith = useTempProjects('nitpicker-jvm-delay-');

function java(body: string, header = '') {
  const text = `package shop;\n${header}class Poller {\n${body}\n}\n`;
  return read(projectWith({ 'src/main/java/shop/Poller.java': text }), {
    projects: [PROJECT],
    kotlin: false,
  });
}

function kotlin(body: string) {
  const text = `package shop\n${body}\n`;
  return read(projectWith({ 'src/main/kotlin/shop/Poller.kt': text }), {
    projects: [PROJECT],
    kotlin: true,
  });
}

describe('UninjectableDelay in Java', () => {
  it('reports a sleep on a private constant in a public method, and says the allowed form', () => {
    const findings = java(`  private static final long RETRY_DELAY_MS = 2_000L;
  public void poll() throws InterruptedException {
    Thread.sleep(RETRY_DELAY_MS);
  }`);
    expect(findings.map(({ message }) => message)).toEqual([
      'Thread.sleep waits RETRY_DELAY_MS (2000 ms), a constant that public "poll" cannot override, so a test must wait it out or fake the clock. Accept the delay as a constructor or method parameter (or a field the constructor sets) that defaults to RETRY_DELAY_MS. An exception fits only when the delay is deliberately fixed. If this is intended, add {"rule":"pmd/UninjectableDelay","paths":["src/main/java/shop/Poller.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('reports TimeUnit sleeps, schedule calls and products of constants', () => {
    const lines = java(`  private static final int SECONDS_BETWEEN = 3;
  private static final long DELAY = 5 * 1000;
  public Poller() throws Exception {
    TimeUnit.SECONDS.sleep(SECONDS_BETWEEN);
    timer.schedule(task, DELAY);
    executor.schedule(task, SECONDS_BETWEEN, TimeUnit.SECONDS);
  }`).map(({ location }) => location.line);
    expect(lines).toEqual([6, 7, 8]);
  });

  it('allows a delay held in a field, a parameter and a small constant', () => {
    expect(
      java(`  private static final long RETRY_DELAY_MS = 2_000L;
  private static final long TICK = 50;
  private final long delayMs;
  public Poller() { this(RETRY_DELAY_MS); }
  public Poller(long delayMs) { this.delayMs = delayMs; }
  public void poll() throws InterruptedException { Thread.sleep(delayMs); }
  public void tick() throws InterruptedException { Thread.sleep(TICK); }
  public void wait(long pauseMs) throws InterruptedException { Thread.sleep(RETRY_DELAY_MS); }
  private void hidden() throws InterruptedException { Thread.sleep(RETRY_DELAY_MS); }`),
    ).toEqual([]);
  });

  it('does not read a constant that is not static final or a delay that is not a constant', () => {
    expect(
      java(`  private long retry = 2_000L;
  public void poll(Sleeper s) throws InterruptedException {
    Thread.sleep(retry);
    Thread.sleep(2_000L);
  }`),
    ).toEqual([]);
  });
});

describe('UninjectableDelay in Kotlin', () => {
  it('reports delay and Thread.sleep on a top-level constant', () => {
    const findings = kotlin(`private const val RETRY_DELAY = 1_000L
class Poller {
  suspend fun poll() {
    delay(RETRY_DELAY)
  }
}
fun pause() {
  Thread.sleep(RETRY_DELAY)
}`);
    expect(findings.map(({ location }) => location.line)).toEqual([5, 9]);
    expect(findings[0]?.message).toBe(
      'delay waits RETRY_DELAY (1000 ms), a constant that public "poll" cannot override, so a test must wait it out or fake the clock. Accept the delay as a parameter with the constant as its default, for example "delayMs: Long = RETRY_DELAY". An exception fits only when the delay is deliberately fixed. If this is intended, add {"rule":"pmd/UninjectableDelay","paths":["src/main/kotlin/shop/Poller.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports a duration constant', () => {
    expect(
      kotlin(`private val RETRY_DELAY = 2.seconds
suspend fun poll() {
  delay(RETRY_DELAY)
}`),
    ).toHaveLength(1);
  });

  it('allows a default parameter, a private function and a short delay', () => {
    expect(
      kotlin(`private const val RETRY_DELAY = 1_000L
private const val TICK = 10L
suspend fun poll(delayMs: Long = RETRY_DELAY) {
  delay(delayMs)
}
suspend fun fixed(delayMs: Long = 5) {
  delay(RETRY_DELAY)
}
private suspend fun hidden() {
  delay(RETRY_DELAY)
}
suspend fun tick() {
  delay(TICK)
}`),
    ).toEqual([]);
  });
});

describe('UninjectableDelay reachability and lookup', () => {
  it('skips main, private classes and unrelated Kotlin defaults', () => {
    expect(
      java(`  private static final long D = 2_000L;
  public static void main(String[] args) throws Exception { Thread.sleep(D); }
  private static class Inner {
    public void run() throws Exception { Thread.sleep(D); }
  }
  public void poll() throws Exception { Thread.sleep(D); }`).map(({ location }) => location.line),
    ).toEqual([8]);
    expect(
      kotlin(`private const val D = 2000L
private class Hidden {
  suspend fun run() { delay(D) }
}
suspend fun poll(retries: Int = 3) { delay(D) }`).map(({ location }) => location.line),
    ).toEqual([6]);
  });

  it('resolves a shadowing local, a duration suffix and a qualified constant', () => {
    expect(
      kotlin(`private const val D = 2
suspend fun a() {
  val D = 1
  delay(D.seconds)
}
suspend fun b() { delay(D.seconds) }
object C { const val E = 3000L }
suspend fun c() { delay(C.E) }`).map(({ location }) => location.line),
    ).toEqual([7, 9]);
  });
});
