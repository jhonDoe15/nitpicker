const TEST_TOOLS = ['jacoco', 'pit', 'pit-junit5', 'pit-testng'];

export function withoutTestTools(tools) {
  return Object.fromEntries(
    Object.entries(tools).filter(
      ([name]) => !TEST_TOOLS.includes(name) && !name.startsWith('launcher-'),
    ),
  );
}
