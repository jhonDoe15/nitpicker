export const JVM_NOISE =
  /^(?:Picked up (?:JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS)|NOTE: Picked up)/u;

export function withoutJvmNoise(text) {
  return text
    .split(/\r?\n/u)
    .filter((line) => !JVM_NOISE.test(line))
    .join('\n');
}
