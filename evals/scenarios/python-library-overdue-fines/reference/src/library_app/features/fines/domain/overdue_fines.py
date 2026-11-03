from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from library_app.features.members import Member, Tier

CAP_DAYS = 20


@dataclass(frozen=True)
class FineEntry:
    member: Member
    cents: int


def fine_cents(daily_rate_cents: int, days_late: int, tier: Tier) -> int:
    full_fine = min(days_late, CAP_DAYS) * daily_rate_cents
    return full_fine // 2 if tier == Tier.STUDENT else full_fine


def format_cents(cents: int) -> str:
    dollars, remainder = divmod(cents, 100)
    return f"${dollars}.{remainder:02d}"


def member_totals(entries: Sequence[FineEntry]) -> Counter[Member]:
    totals: Counter[Member] = Counter()
    for entry in entries:
        totals[entry.member] += entry.cents
    return totals


def render_report(as_of: str, entries: Sequence[FineEntry]) -> list[str]:
    header = f"Overdue fines as of {as_of}"
    owing = [
        (member.name, total)
        for member, total in member_totals(entries).items()
        if total > 0
    ]
    if not owing:
        return [header, "No overdue fines"]
    ranked = sorted(owing, key=lambda owed: (-owed[1], owed[0]))
    return [header, *[f"{name}: {format_cents(total)}" for name, total in ranked]]
