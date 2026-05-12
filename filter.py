import pandas as pd

from core.filters import PRESETS

FILE = "E:/sim_data/vnpt/result_88.csv"
OUTPUT_FILE = FILE.replace(".csv", "_filtered.csv")

df = pd.read_csv(FILE, dtype=str, header=None)
df.columns = ["number"]

for name, fn in PRESETS.items():
    df[name] = df["number"].apply(fn)

df.to_csv(OUTPUT_FILE, index=False)
print(f"Saved {len(df)} rows → {OUTPUT_FILE}")
