"""
Has the average price of Steam games fallen over release years 2010-2018?
Track mean price by release year.
"""
import pandas as pd

df = pd.read_csv(r"d:\Study\Lab\human-AI-logs\data\steam.csv",
                 usecols=["appid", "release_date", "price"])

df["release_date"] = pd.to_datetime(df["release_date"], errors="coerce")
df["year"] = df["release_date"].dt.year
df = df.dropna(subset=["year", "price"])
df["year"] = df["year"].astype(int)

print(f"total games with valid year+price: {len(df):,}")
print(f"price range: {df['price'].min()} - {df['price'].max()}  (currency: GBP )")
print()

sub = df[(df["year"] >= 2010) & (df["year"] <= 2018)]
tab = sub.groupby("year")["price"].agg(
    n_games="size", mean_price="mean", median_price="median").reset_index()

print("Mean price by release year (2010-2018):")
print(tab.to_string(index=False, formatters={
    "mean_price": "{:.2f}".format, "median_price": "{:.2f}".format,
    "n_games": "{:,}".format}))
print()

# Trend: correlation of year vs mean price, and first vs last.
r = tab["year"].corr(tab["mean_price"])
print(f"Pearson r (year vs yearly mean price): {r:+.4f}")
print(f"2010 mean: {tab.loc[tab.year==2010,'mean_price'].iloc[0]:.2f}   "
      f"2018 mean: {tab.loc[tab.year==2018,'mean_price'].iloc[0]:.2f}")

# Robustness: free games (price==0) can dominate as the catalog explodes.
paid = sub[sub["price"] > 0]
tab_paid = paid.groupby("year")["price"].mean()
print("\nMean price excluding free (price>0) games:")
for y, v in tab_paid.items():
    share_free = (sub[sub.year==y]["price"]==0).mean()
    print(f"  {y}: {v:.2f}   (free-game share that year: {share_free:.1%})")
