"""
Can we recover Valve-developed games purely from description-text similarity?
Approach: TF-IDF over game descriptions -> cosine similarity.
  (a) Query with Half-Life 2; inspect the top hits.
  (b) Leave-one-out: each Valve game as query, measure how many other Valve
      games rank in the top-K -> precision/recall vs a random baseline.
"""
import re
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

BASE = r"d:\Study\Lab\human-AI-logs\data"
meta = pd.read_csv(BASE + r"\steam.csv", usecols=["appid", "name", "developer"])
desc = pd.read_csv(BASE + r"\steam_description_data.csv",
                   usecols=["steam_appid", "about_the_game", "short_description"])
desc = desc.rename(columns={"steam_appid": "appid"})

df = meta.merge(desc, on="appid", how="inner")
# prefer about_the_game; fall back to short_description
df["text"] = df["about_the_game"].fillna("").where(
    df["about_the_game"].fillna("").str.len() > 0, df["short_description"].fillna(""))

# strip HTML tags / entities and collapse whitespace
def clean(t):
    t = re.sub(r"<[^>]+>", " ", str(t))
    t = re.sub(r"&[a-z]+;", " ", t)
    return re.sub(r"\s+", " ", t).strip()
df["text"] = df["text"].map(clean)
df = df[df["text"].str.len() > 30].reset_index(drop=True)

# Valve flag (exclude the "Valverde" false positives)
dev = df["developer"].fillna("")
df["is_valve"] = dev.str.contains(r"\bValve\b", case=False, regex=True) & ~dev.str.contains("Valverde")
n_valve = int(df["is_valve"].sum())
print(f"games with usable descriptions: {len(df):,}")
print(f"Valve games among them:         {n_valve}")
print(f"Valve base rate:                {n_valve/len(df):.4%}\n")

# TF-IDF
vec = TfidfVectorizer(stop_words="english", min_df=3, max_df=0.5,
                      ngram_range=(1, 2), sublinear_tf=True)
X = vec.fit_transform(df["text"])

idx = {a: i for i, a in enumerate(df["appid"])}

# ---------- (a) Query: Half-Life 2 ----------
HL2 = 220
qi = idx[HL2]
sims = linear_kernel(X[qi], X).ravel()
order = np.argsort(-sims)
order = order[order != qi]  # drop self
print("="*72)
print("Top 20 games most similar to HALF-LIFE 2's description:")
print("="*72)
for rank, i in enumerate(order[:20], 1):
    tag = "  <-- VALVE" if df["is_valve"].iloc[i] else ""
    print(f"  {rank:>2}. sim={sims[i]:.3f}  {df['name'].iloc[i][:45]:<45} "
          f"[{df['developer'].iloc[i][:22]}]{tag}")

valve_idx = set(np.where(df["is_valve"].to_numpy())[0]) - {qi}
ranks_of_valve = {int(np.where(order == vi)[0][0]) + 1: df["name"].iloc[vi]
                  for vi in valve_idx}
print(f"\nRanks of the other {len(valve_idx)} Valve games in the HL2-query ranking:")
for r in sorted(ranks_of_valve):
    print(f"  rank {r:>5}: {ranks_of_valve[r]}")
print(f"  median rank of Valve games: {int(np.median(sorted(ranks_of_valve)))} "
      f"(out of {len(order):,})")

# ---------- (b) Leave-one-out retrieval over all Valve games ----------
print("\n" + "="*72)
print("Leave-one-out: each Valve game as query -> Valve hits in top-K")
print("="*72)
valve_positions = np.where(df["is_valve"].to_numpy())[0]
S = linear_kernel(X[valve_positions], X)  # (n_valve x N)
base = n_valve / len(df)
for K in [5, 10, 20, 50]:
    precs, recs = [], []
    for row, vp in enumerate(valve_positions):
        s = S[row].copy(); s[vp] = -1  # drop self
        topk = np.argpartition(-s, K)[:K]
        hits = df["is_valve"].to_numpy()[topk].sum()
        precs.append(hits / K)
        recs.append(hits / (n_valve - 1))
    lift = np.mean(precs) / base
    print(f"  K={K:>2}:  precision@K={np.mean(precs):.3f}  recall@K={np.mean(recs):.3f}"
          f"   (random precision={base:.4f}, lift={lift:.0f}x)")
