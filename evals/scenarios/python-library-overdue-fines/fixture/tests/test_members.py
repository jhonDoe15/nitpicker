from library_app.features.members import InMemoryMembers, Member, Tier

ADA = Member("M1", "Ada Stone", Tier.STANDARD)
GRACE = Member("M2", "Grace Mill", Tier.STUDENT)


def test_finds_members_by_id() -> None:
    directory = InMemoryMembers([ADA, GRACE])
    assert directory.find("M2") == GRACE
    assert directory.find("M3") is None


def test_keeps_the_tier_of_each_member() -> None:
    assert [ADA.tier, GRACE.tier] == ["standard", "student"]
