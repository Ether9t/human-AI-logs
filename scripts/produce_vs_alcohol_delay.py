"""
Compare inter-order delay (days_since_prior_order) between
users who buy from PRODUCE (dept 4) vs users who buy from ALCOHOL (dept 5).
Prior order history only.
"""
import numpy as np
import pandas as pd

BASE = r"C:\Users\14361\.cache\kagglehub\datasets\psparks\instacart-market-basket-analysis\versions\1"

prod = pd.read_csv(BASE + r"\products.csv", usecols=["product_id", "department_id"],
                   dtype={"product_id": "int32", "department_id": "int8"})
dept_of = prod.set_index("product_id")["department_id"]

op = pd.read_csv(BASE + r"\order_products__prior.csv", usecols=["order_id", "product_id"],
                 dtype={"order_id": "int32", "product_id": "int32"})
op["dept"] = op["product_id"].map(dept_of).astype("float").astype("Int16")

orders = pd.read_csv(BASE + r"\orders.csv",
                     usecols=["order_id", "user_id", "eval_set", "days_since_prior_order"],
                     dtype={"order_id": "int32", "user_id": "int32"})
orders = orders[orders["eval_set"] == "prior"]

# order_id -> user_id
order_user = orders.set_index("order_id")["user_id"]
op["user_id"] = op["order_id"].map(order_user)

# users who ever bought from each department
produce_users = set(op.loc[op["dept"] == 4, "user_id"].dropna().unique())
alcohol_users = set(op.loc[op["dept"] == 5, "user_id"].dropna().unique())
print(f"users buying produce: {len(produce_users):,}")
print(f"users buying alcohol: {len(alcohol_users):,}")
print(f"overlap (both):       {len(produce_users & alcohol_users):,}\n")

def stats(label, users):
    sub = orders[orders["user_id"].isin(users)]
    d = sub["days_since_prior_order"].dropna()   # first order per user is NaN
    print(f"{label}")
    print(f"  users={len(users):,}  orders w/ gap={len(d):,}")
    print(f"  mean delay   = {d.mean():.3f} days")
    print(f"  median delay = {d.median():.1f} days")
    print(f"  std={d.std():.2f}  p25={d.quantile(.25):.0f}  p75={d.quantile(.75):.0f}\n")
    return d

print("=== Inter-order delay by department-buyer group (all that group's orders) ===\n")
dp = stats("PRODUCE buyers", produce_users)
da = stats("ALCOHOL buyers", alcohol_users)

# Exclusive comparison to remove overlap contamination
only_p = produce_users - alcohol_users
only_a = alcohol_users - produce_users
print("=== Exclusive groups (removes the large overlap) ===\n")
stats("PRODUCE-only buyers", only_p)
stats("ALCOHOL-only buyers", only_a)

print(f"Mean delay difference (produce - alcohol): {dp.mean()-da.mean():+.3f} days")
print(f"Median delay difference (produce - alcohol): {dp.median()-da.median():+.1f} days")
