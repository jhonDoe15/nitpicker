const LONGEST_UNIT = 120;
const LEAST_REPEATS = 3;

function longestPeriodicRun(characters, period) {
  let longest = 0;
  let current = 0;
  for (const [index, character] of characters.slice(period).entries()) {
    current = character === characters[index] ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest + period;
}

export function isRepeatingShape(fragment) {
  const characters = [...fragment];
  const longestUnit = Math.min(LONGEST_UNIT, Math.floor(characters.length / LEAST_REPEATS));
  const periods = Array.from({ length: Math.max(0, longestUnit) }, (_, index) => index + 1);
  return periods.some((period) => {
    const run = longestPeriodicRun(characters, period);
    const rest = characters.length - run + period;
    return run >= period * LEAST_REPEATS && rest * 2 < characters.length;
  });
}
