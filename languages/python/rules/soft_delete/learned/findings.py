from soft_delete.learned.flags import flag_findings
from soft_delete.learned.reads import raw_reads
from soft_delete.learned.scoping import scoping_findings


def learned_findings(context):
    project = context.project
    flags, scoping = flag_findings(project), scoping_findings(project)
    found = []
    for read in raw_reads(context):
        entry = flags.get(id(read.chain)) or scoping.get(id(read.chain))
        if entry is not None:
            _, field, majority = entry
            subject = (
                f"{read.qualified}|{read.model}|{field}|{majority.via}"
                f"|{majority.filtered} of {majority.total}"
            )
            found.append((read.chain, subject))
    return found
