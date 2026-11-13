import { directoryOf } from './go-packages.mjs';

function publishedLookup(packages) {
  return (file) => packages.isPublished(directoryOf(file));
}

export function goDesignFacts(report, packages) {
  const design = report.design ?? {};
  const isPublished = publishedLookup(packages);
  return {
    types: (design.types ?? []).map((type) =>
      type.exported && isPublished(type.file) ? { ...type, published: true } : type,
    ),
    callables: (design.callables ?? []).map((callable) =>
      callable.exported && isPublished(callable.file) && callable.owner === callable.file
        ? { ...callable, published: true }
        : callable,
    ),
  };
}
