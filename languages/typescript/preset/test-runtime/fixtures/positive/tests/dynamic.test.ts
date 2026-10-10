async function loadFeature(): Promise<typeof import('../src/main/feature.js')> {
  return import('../src/main/feature.js');
}

void loadFeature();
