import { directoryOf } from '../typed/go-readers.mts';
import type { GoFacts, GoPackages, InspectReport } from '../go-types.mts';

function publishedLookup(packages: GoPackages) {
  return (file: string) => packages.isPublished(directoryOf(file));
}

export function goDesignFacts(
  report: Pick<InspectReport, 'design'>,
  packages: GoPackages,
): Pick<GoFacts, 'types' | 'callables'> {
  const design = report.design;
  const isPublished = publishedLookup(packages);
  return {
    types: (design?.types ?? []).map((type) =>
      type.exported && isPublished(type.file) ? { ...type, published: true } : type,
    ),
    callables: (design?.callables ?? []).map((callable) =>
      callable.exported && isPublished(callable.file) && callable.owner === callable.file
        ? { ...callable, published: true }
        : callable,
    ),
  };
}
