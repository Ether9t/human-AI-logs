"""
Do users with broader tastes (more unique aisles) reorder more?
Per user (PRIOR history only):
  - unique_aisles   = # distinct aisles they have ever purchased from
  - reorder_rate    = mean(reordered) across all their prior item-lines
Then correlate unique_aisles vs reorder_rate (Pearson + Spearman).
"""
import numpy as np
import pandas as pd

BASE = r"C:\Users\14361\.cache\kagglehub\datasets\psparks\instacart-market-basket-analysis\versions\1"

# order -> user (prior orders only)
orders = pd.read_csv(BASE + r"\orders.csv",
                     usecols=["order_id", "user_id", "eval_set"],
                     dtype={"order_id": "int32", "user_id": "int32"})
orders = orders[orders["eval_set"] == "prior"][["order_id", "user_id"]]

# product -> aisle
prod = pd.read_csv(BASE + r"\products.csv",
                   usecols=["product_id", "aisle_id"],
                   dtype={"product_id": "int32", "aisle_id": "int16"})
aisle_of = prod.set_index("product_id")["aisle_id"]

# prior item-lines
op = pd.read_csv(BASE + r"\order_products__prior.csv",
                 usecols=["order_id", "product_id", "reordered"],
                 dtype={"order_id": "int32", "product_id": "int32", "reordered": "int8"})

# attach user_id and aisle_id
op = op.merge(orders, on="order_id", how="left")
op["aisle_id"] = op["product_id"].map(aisle_of).astype("int16")

# per-user aggregates
g = op.groupby("user_id")
user = pd.DataFrame({
    "unique_aisles": g["aisle_id"].nunique(),
    "reorder_rate":  g["reordered"].mean(),
    "n_items":       g["reordered"].size(),
}).reset_index()

print(f"users: {len(user):,}")
print(user[["unique_aisles", "reorder_rate", "n_items"]].describe().to_string())
print()

pear = user["unique_aisles"].corr(user["reorder_rate"], method="pearson")
spear = user["unique_aisles"].corr(user["reorder_rate"], method="spearman")
print(f"Pearson  correlation (unique_aisles vs reorder_rate): {pear:+.4f}")
print(f"Spearman correlation (unique_aisles vs reorder_rate): {spear:+.4f}")
print()

# mean reorder rate across bins of aisle diversity (to see the shape)
bins = [0, 5, 10, 15, 20, 25, 30, 40, 60, 200]
user["aisle_bin"] = pd.cut(user["unique_aisles"], bins=bins)
tab = user.groupby("aisle_bin", observed=True).agg(
    users=("user_id", "size"),
    mean_reorder_rate=("reorder_rate", "mean"),
)
print("Mean reorder rate by unique-aisle bin:")
print(tab.to_string(formatters={"mean_reorder_rate": "{:.4f}".format}))

user.to_csv(r"d:\Study\Lab\human-AI-logs\user_aisle_diversity_reorder.csv", index=False)
print("\nSaved per-user table -> user_aisle_diversity_reorder.csv")
