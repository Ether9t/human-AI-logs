"""
Robustness check: is the position->reorder decline driven by cart SEQUENCE,
or merely by basket size (high positions only exist in large baskets)?

We hold basket size fixed and re-examine reorder rate by position within it.
Uses ONLY order_products__prior.csv.
"""
import numpy as np
import pandas as pd

BASE = r"C:\Users\14361\.cache\kagglehub\datasets\psparks\instacart-market-basket-analysis\versions\1"
PRIOR = BASE + r"\order_products__prior.csv"

df = pd.read_csv(
    PRIOR,
    usecols=["order_id", "add_to_cart_order", "reordered"],
    dtype={"order_id": "int32", "add_to_cart_order": "int16", "reordered": "int8"},
)

# Basket size = number of items in each order.
basket_size = df.groupby("order_id")["add_to_cart_order"].transform("size").astype("int16")
df["basket_size"] = basket_size

# Reorder rate by basket size (context: do big baskets reorder less overall?)
bs = (df.groupby("basket_size")["reordered"].agg(rate="mean", n="size").reset_index())
print("Reorder rate by basket size (selected):")
for n in [1, 2, 3, 5, 8, 10, 15, 20, 30]:
    r = bs.loc[bs.basket_size == n]
    if len(r):
        print(f"  basket_size={n:>3}: reorder_rate={r['rate'].iloc[0]:.4f}  (items={int(r['n'].iloc[0]):,})")
print()

# Within fixed basket sizes, reorder rate by absolute position.
print("Reorder rate by position WITHIN a fixed basket size (the clean test):")
for N in [5, 10, 15, 20]:
    sub = df[df["basket_size"] == N]
    g = sub.groupby("add_to_cart_order")["reordered"].mean()
    first, last = g.iloc[0], g.iloc[-1]
    print(f"\n  basket_size = {N}  ({sub['order_id'].nunique():,} orders)")
    print("    pos:  " + "  ".join(f"{p:>2}" for p in g.index))
    print("    rate: " + "  ".join(f"{v:.2f}" for v in g.values))
    print(f"    pos1={first:.4f}  pos{N}={last:.4f}  drop={first-last:+.4f}")

# Normalized position: split each basket into deciles of cart order, pooled across sizes
# (only baskets with >=10 items so deciles are meaningful).
big = df[df["basket_size"] >= 10].copy()
rank = big.groupby("order_id")["add_to_cart_order"].rank(method="first")
big["pct"] = (rank - 1) / (big["basket_size"] - 1)  # 0 = first item, 1 = last item
big["decile"] = np.clip((big["pct"] * 10).astype(int), 0, 9)
print("\n\nNormalized cart position (baskets >=10 items), reorder rate by decile of cart:")
dec = big.groupby("decile")["reordered"].agg(rate="mean", n="size")
for d, row in dec.iterrows():
    print(f"  decile {d} ({d*10:>3}-{d*10+10:>3}% of cart): reorder_rate={row['rate']:.4f}  (items={int(row['n']):,})")
