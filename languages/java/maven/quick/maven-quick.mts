const TEST_TOOLS = ['jacoco', 'pit', 'pit-junit5', 'pit-testng'];

export function withoutTestTools<Value>(
  tools: Readonly<Record<string, Value>>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(tools).filter(
      ([name]) => !(TEST_TOOLS.includes(name) || name.startsWith('launcher-')),
    ),
  );
}

const PIT_TOOLS = ['pit', 'pit-junit5', 'pit-testng'];

export function withoutPitTools<Value>(
  tools: Readonly<Record<string, Value>>,
  { mutationOff }: { readonly mutationOff: boolean },
): Readonly<Record<string, Value>> {
  return mutationOff
    ? Object.fromEntries(
        Object.entries(tools).filter(
          ([name]) => !(PIT_TOOLS.includes(name) || name.startsWith('launcher-')),
        ),
      )
    : tools;
}
