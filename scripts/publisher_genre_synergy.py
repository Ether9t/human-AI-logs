"""
Investment screen on Steam publishers.
Part 1: top publishers per genre by market footprint (estimated owners + title count).
Part 2: genre synergy matrix = how related genres are within publisher portfolios
        (cosine similarity of the publisher x genre matrix).
"""
import numpy as np
import pandas as pd

df = pd.read_csv(r"d:\Study\Lab\human-AI-logs\data\steam.csv")

# --- estimated owners: midpoint of the "min-max" range ---
def owners_mid(s):
    try:
        lo, hi = str(s).split("-")
        return (float(lo) + float(hi)) / 2.0
    except Exception:
        return np.nan
df["owners_est"] = df["owners"].map(owners_mid)

# clean publisher / genres; explode genres (semicolon-separated)
df = df[df["publisher"].notna() & (df["publisher"].str.strip() != "")]
df["genres"] = df["genres"].fillna("")
g = df.assign(genre=df["genres"].str.split(";")).explode("genre")
g["genre"] = g["genre"].str.strip()
g = g[g["genre"] != ""]

# =================== PART 1: top publishers per genre ===================
genre_size = g.groupby("genre").agg(
    games=("appid", "size"),
    total_owners=("owners_est", "sum"),
).sort_values("total_owners", ascending=False)
print("Genres ranked by total estimated owners:")
print(genre_size.assign(
    total_owners=(genre_size.total_owners/1e6).round(1).astype(str)+"M"
).to_string())
print()

# focus on the major genres (drop tiny/meta where useful but keep all top ones)
top_genres = genre_size.head(12).index.tolist()

print("="*70)
print("TOP 5 PUBLISHERS PER GENRE (by total estimated owners)")
print("="*70)
top_pub_rows = []
for gen in top_genres:
    sub = g[g["genre"] == gen]
    pub = sub.groupby("publisher").agg(
        games=("appid", "size"),
        owners=("owners_est", "sum"),
        pos=("positive_ratings", "sum"),
    ).sort_values("owners", ascending=False).head(5)
    print(f"\n[{gen}]  ({genre_size.loc[gen,'games']:,} games, "
          f"{genre_size.loc[gen,'total_owners']/1e6:.0f}M owners)")
    for rank, (name, row) in enumerate(pub.iterrows(), 1):
        print(f"  {rank}. {name:<32} owners~{row['owners']/1e6:6.1f}M  "
              f"games={int(row['games']):>3}  pos_ratings={int(row['pos']):,}")
        top_pub_rows.append({"genre": gen, "rank": rank, "publisher": name,
                             "est_owners": row["owners"], "games": int(row["games"])})
pd.DataFrame(top_pub_rows).to_csv(
    r"d:\Study\Lab\human-AI-logs\top_publishers_per_genre.csv", index=False)

# =================== PART 2: genre synergy matrix ===================
# publisher x genre matrix of title counts, then cosine similarity between genre columns.
pg = (g.groupby(["publisher", "genre"]).size().unstack(fill_value=0))
# keep the meaningful genres (all that appear); use counts per publisher
M = pg[top_genres].to_numpy(dtype=float)          # publishers x genres
# cosine similarity between genre vectors (columns)
norm = np.linalg.norm(M, axis=0)
sim = (M.T @ M) / np.outer(norm, norm)
sim_df = pd.DataFrame(sim, index=top_genres, columns=top_genres)

print("\n" + "="*70)
print("GENRE SYNERGY MATRIX (cosine similarity over publisher portfolios)")
print("="*70)
print(sim_df.round(2).to_string())
sim_df.to_csv(r"d:\Study\Lab\human-AI-logs\genre_synergy_matrix.csv")

# top synergistic genre pairs (off-diagonal)
pairs = []
for i in range(len(top_genres)):
    for j in range(i+1, len(top_genres)):
        pairs.append((top_genres[i], top_genres[j], sim[i, j]))
pairs.sort(key=lambda x: -x[2])
print("\nTop 12 most synergistic genre pairs (shared publisher portfolios):")
for a, b, s in pairs[:12]:
    print(f"  {s:.3f}   {a}  +  {b}")
print("\nLeast synergistic (most independent) pairs:")
for a, b, s in pairs[-6:]:
    print(f"  {s:.3f}   {a}  +  {b}")
print("\nSaved: top_publishers_per_genre.csv, genre_synergy_matrix.csv")
