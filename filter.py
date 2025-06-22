import pandas as pd

FILE = "E:/sim_data/vnpt/result_88.csv"
OUTPUT_FILE = FILE.replace(".csv", "_filtered.csv")


def is_all_even(number):
    return all(int(d) % 2 == 0 for d in number)


def is_last4_increasing(number):
    last4 = [int(d) for d in number[-4:]]
    return last4[1] == last4[0] + 1 and last4[2] == last4[1] + 1 and last4[3] == last4[2] + 1


def number_of_digit_except_first(number):
    return len(set(number[1:]))


def number_of_digit(number):
    return len(set(number[0:]))


def is_lap_doi(number):
    number = str(number)[-6:]
    return (number[0] == number[1] and
            number[2] == number[3] and
            number[4] == number[5])


def is_taxi(number):
    number = str(number)[-6:]
    return number[:3] == number[3:] or (number[0] == number[2] == number[4] and number[1] == number[3] == number[5])


def xyzxyz(number):
    for i in range(len(number) - 5):  # dừng ở len-6 vì cần 6 ký tự cho 2 cụm 3 số
        first = number[i:i + 3]
        second = number[i + 3:i + 6]
        if first == second:
            return True
    return False


def xyztxyzt(number):
    for i in range(len(number) - 8):  # dừng ở len-6 vì cần 6 ký tự cho 2 cụm 3 số
        first = number[i:i + 4]
        second = number[i + 4:i + 8]
        if first == second:
            return True
    return False


def _x_x_x_x_x(number):
    return number[1] == number[3] and number[3] == number[5] and number[5] == number[7] and number[7] == number[9]


def y_y_y_y_y_(number):
    return number[0] == number[2] and number[2] == number[4] and number[4] == number[6] and number[6] == number[8]


def has_tu_quy(number):
    number = str(number)
    for i in range(len(number) - 3):
        if number[i] == number[i + 1] == number[i + 2] == number[i + 3]:
            return True
    return False


def has_ngu_quy(number):
    number = str(number)
    for i in range(len(number) - 4):
        if number[i] == number[i + 1] == number[i + 2] == number[i + 3] == number[i + 4]:
            return True
    return False


df = pd.read_csv(FILE, dtype={"number": str})

df["AllEven"] = df["number"].astype(str).apply(is_all_even)
df["Last4Increasing"] = df["number"].astype(str).apply(is_last4_increasing)
df["NumberDigitExceptFirst"] = df["number"].astype(str).apply(number_of_digit_except_first)
df["NumberDigit"] = df["number"].astype(str).apply(number_of_digit)
df["Lap doi"] = df["number"].astype(str).apply(is_lap_doi)
df["Taxi"] = df["number"].astype(str).apply(is_taxi)
df["XXX"] = df["number"].astype(str).apply(_x_x_x_x_x)
df["YYY"] = df["number"].astype(str).apply(y_y_y_y_y_)
df["Tu_quy"] = df["number"].apply(has_tu_quy)
df["Ngu_quy"] = df["number"].apply(has_ngu_quy)
df["xyzxyz"] = df["number"].apply(xyzxyz)
df["xyztxyzt"] = df["number"].apply(xyztxyzt)
df.to_csv(OUTPUT_FILE, index=False)
