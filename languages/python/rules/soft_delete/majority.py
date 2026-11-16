from collections import Counter, namedtuple

from soft_delete.reads import FILTERED, UNFILTERED, reads_of

THRESHOLD = 0.8
MINIMUM = 5
Majority = namedtuple("Majority", "filtered total via")


def read_majorities(project):
    def build(_):
        tally = {}
        for context in project.contexts.values():
            if context.tests:
                continue
            for read in reads_of(context):
                tally.setdefault(read.model, []).append(read)
        return {
            model: majority_of(reads)
            for model, reads in tally.items()
            if majority_of(reads) is not None
        }

    return project.memo("soft-read-majorities", build)


def majority_of(reads):
    filtered = [read for read in reads if read.status == FILTERED]
    total = len(reads)
    if total < MINIMUM or len(filtered) / total < THRESHOLD:
        return None
    if len(filtered) == total:
        return None
    helpers = Counter(read.helper for read in filtered if read.helper)
    name, uses = helpers.most_common(1)[0] if helpers else (None, 0)
    field = filtered[0].field
    via = f"{name}()" if name and uses * 2 > len(filtered) else field
    return Majority(len(filtered), total, via)


def unfiltered_reads(context):
    majorities = read_majorities(context.project)
    return [
        (read, majorities[read.model])
        for read in reads_of(context)
        if read.status == UNFILTERED and read.model in majorities
    ]
