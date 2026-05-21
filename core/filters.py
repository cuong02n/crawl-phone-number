from typing import Callable


def has_tu_quy(number: str) -> bool:
    for i in range(len(number) - 3):
        if number[i] == number[i + 1] == number[i + 2] == number[i + 3]:
            return True
    return False


def has_ngu_quy(number: str) -> bool:
    for i in range(len(number) - 4):
        if number[i] == number[i + 1] == number[i + 2] == number[i + 3] == number[i + 4]:
            return True
    return False


def is_taxi(number: str) -> bool:
    s = str(number)[-6:]
    if len(s) < 6:
        return False
    return s[:3] == s[3:] or (s[0] == s[2] == s[4] and s[1] == s[3] == s[5])


def is_lap_doi(number: str) -> bool:
    s = str(number)[-6:]
    if len(s) < 6:
        return False
    return s[0] == s[1] and s[2] == s[3] and s[4] == s[5]


def is_last4_increasing(number: str) -> bool:
    s = str(number)
    if len(s) < 4:
        return False
    last4 = [int(d) for d in s[-4:]]
    return last4[1] == last4[0] + 1 and last4[2] == last4[1] + 1 and last4[3] == last4[2] + 1


def is_all_even(number: str) -> bool:
    return all(int(d) % 2 == 0 for d in str(number))


def has_sanh_tien(number: str) -> bool:
    s = str(number)
    count = 1
    for i in range(len(s) - 1):
        if int(s[i + 1]) == int(s[i]) + 1:
            count += 1
            if count >= 4:
                return True
        else:
            count = 1
    return False


def xyzxyz(number: str) -> bool:
    for i in range(len(number) - 5):
        if number[i:i + 3] == number[i + 3:i + 6]:
            return True
    return False


def xyztxyzt(number: str) -> bool:
    for i in range(len(number) - 7):
        if number[i:i + 4] == number[i + 4:i + 8]:
            return True
    return False


def is_abxabyabz(number: str) -> bool:
    s = str(number)
    if len(s) == 9:
        s = "0" + s
    if len(s) != 10:
        return False
    ab = s[1:3]
    return s[4:6] == ab and s[7:9] == ab


def is_abx_seq(number: str) -> bool:
    """0abxab(x+1)ab(x+2) — e.g. 0123124125"""
    s = str(number)
    if len(s) == 9:
        s = "0" + s
    if len(s) != 10:
        return False
    ab = s[1:3]
    if s[4:6] != ab or s[7:9] != ab:
        return False
    x = int(s[3])
    return x <= 7 and int(s[6]) == x + 1 and int(s[9]) == x + 2


def is_abx_seq_desc(number: str) -> bool:
    """0abxab(x-1)ab(x-2) — e.g. 0125124123"""
    s = str(number)
    if len(s) == 9:
        s = "0" + s
    if len(s) != 10:
        return False
    ab = s[1:3]
    if s[4:6] != ab or s[7:9] != ab:
        return False
    x = int(s[3])
    return x >= 2 and int(s[6]) == x - 1 and int(s[9]) == x - 2


PRESETS: dict[str, Callable[[str], bool]] = {
    "Tứ quý (xxxx)":            has_tu_quy,
    "Ngũ quý (xxxxx)":          has_ngu_quy,
    "Taxi (abcabc)":             is_taxi,
    "Lặp đôi (aabbcc)":         is_lap_doi,
    "Sảnh xyzxyz":              xyzxyz,
    "Sảnh xyztxyzt":            xyztxyzt,
    "Tiến đều (4 số cuối)":     is_last4_increasing,
    "Sảnh tiến (>=4 số)":       has_sanh_tien,
    "Toàn số chẵn":             is_all_even,
    "0abxabyabz":               is_abxabyabz,
    "0abxab(x+1)ab(x+2)":      is_abx_seq,
    "0abxab(x-1)ab(x-2)":      is_abx_seq_desc,
}
