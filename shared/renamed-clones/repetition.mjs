const LONGEST_UNIT = 120;
const LEAST_REPEATS = 3;

function longestPeriodicRun(text, period) {
  let longest = 0;
  let current = 0;
  for (let index = 0; index + period < text.length; index += 1) {
    current = text[index] === text[index + period] ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest + period;
}

export function isRepeatingShape(fragment) {
  const longestUnit = Math.min(LONGEST_UNIT, Math.floor(fragment.length / LEAST_REPEATS));
  for (let period = 1; period <= longestUnit; period += 1) {
    const run = longestPeriodicRun(fragment, period);
    const rest = fragment.length - run + period;
    if (run >= period * LEAST_REPEATS && rest * 2 < fragment.length) {
      return true;
    }
  }
  return false;
}
