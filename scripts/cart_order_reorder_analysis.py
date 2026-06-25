"""
Does cart-addition sequence predict reorder rate?
Question: are products added FIRST more likely to be reordered than products added LATER?
Constraint: use ONLY the prior order history (order_products__prior.csv).

`reordered` == 1 means the item was purchased by the same user in an earlier order
(i.e. it is a repeat purchase) -> this is our "reorder" outcome.
`add_to_cart_order` is the 1-based sequence position the item was added to the cart.
"""
import numpy as np
import pandas as pd

BASE = r"C:\Users\14361\.cache\kagglehub\datasets\psparks\instacart-market-basket-analysis\versions\1"
PRIOR = BASE + r"\order_products__prior.csv"

# Load only what we need, with compact dtypes (file is ~550 MB).
df = pd.read_csv(
    PRIOR,
    usecols=["order_id", "add_to_cart_order", "reordered"],
    dtype={"order_id": "int32", "add_to_cart_order": "int16", "reordered": "int8"},
)

n_rows = len(df)
n_orders = df["order_id"].nunique()
overall = df["reordered"].mean()
print(f"prior rows (item-order lines): {n_rows:,}")
print(f"distinct prior orders:         {n_orders:,}")
print(f"overall reorder rate:          {overall:.4f}")
print()

# ---- Headline: reorder rate by cart position ----
by_pos = (
    df.groupby("add_to_cart_order")["reordered"]
    .agg(reorder_rate="mean", n_items="size")
    .reset_index()
    .rename(columns={"add_to_cart_order": "cart_position"})
)

print("Reorder rate by cart position (first 20 positions):")
print(by_pos.head(20).to_string(index=False,
      formatters={"reorder_rate": "{:.4f}".format, "n_items": "{:,}".format}))
print()

# Position 1 vs everything after, and a few anchor positions.
pos1 = df.loc[df["add_to_cart_order"] == 1, "reordered"].mean()
later = df.loc[df["add_to_cart_order"] > 1, "reordered"].mean()
print(f"Position 1 reorder rate:        {pos1:.4f}")
print(f"Positions 2+ reorder rate:      {later:.4f}")
print(f"Absolute gap (pos1 - pos2+):    {pos1 - later:+.4f}  ({(pos1-later)/later*100:+.1f}% relative)")
print()

for k in [1, 2, 3, 5, 10, 15, 20, 30, 50]:
    sub = by_pos.loc[by_pos["cart_position"] == k]
    if len(sub):
        r = sub["reorder_rate"].iloc[0]; n = sub["n_items"].iloc[0]
        print(f"  position {k:>3}: reorder_rate={r:.4f}  (n={n:,})")
print()

# ---- Correlation / trend (weighted by item counts) ----
# Restrict to positions with a meaningful sample (>= 1000 items) for the trend stats.
trend = by_pos[by_pos["n_items"] >= 1000].copy()
w = trend["n_items"].to_numpy(dtype=float)
x = trend["cart_position"].to_numpy(dtype=float)
y = trend["reorder_rate"].to_numpy(dtype=float)

# Item-level Pearson correlation between position and the binary reordered flag,
# computed from the aggregates (exact, weighted).
def weighted_corr(x, y, w):
    wm_x = np.average(x, weights=w); wm_y = np.average(y, weights=w)
    cov = np.average((x - wm_x) * (y - wm_y), weights=w)
    vx = np.average((x - wm_x) ** 2, weights=w); vy = np.average((y - wm_y) ** 2, weights=w)
    return cov / np.sqrt(vx * vy)

# Exact item-level correlation: need E[x*y], E[x], E[y] over items.
N = df.shape[0]
sum_x = (by_pos["cart_position"] * by_pos["n_items"]).sum()
sum_y = df["reordered"].sum()
sum_xy = (by_pos["cart_position"] * by_pos["reorder_rate"] * by_pos["n_items"]).sum()  # sum of x*reordered
sum_x2 = (by_pos["cart_position"]**2 * by_pos["n_items"]).sum()
# var(y) for binary: p(1-p)
mean_x = sum_x / N; mean_y = sum_y / N
cov_xy = sum_xy / N - mean_x * mean_y
var_x = sum_x2 / N - mean_x**2
var_y = mean_y * (1 - mean_y)
pearson_item = cov_xy / np.sqrt(var_x * var_y)
print(f"Item-level Pearson r (cart_position vs reordered, all items): {pearson_item:+.4f}")

# Position-level (count-weighted) correlation on positions with >=1000 items:
print(f"Position-level weighted r (rate vs position, n>=1000):       {weighted_corr(x, y, w):+.4f}")

by_pos.to_csv(r"d:\Study\Lab\human-AI-logs\reorder_rate_by_cart_position.csv", index=False)
print("\nSaved full per-position table -> reorder_rate_by_cart_position.csv")
