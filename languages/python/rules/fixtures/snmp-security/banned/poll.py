from pysnmp.hlapi import CommunityData, UsmUserData


def poll():
    return CommunityData("public", mpModel=0), UsmUserData("user")
