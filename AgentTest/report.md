# 📊 Comprehensive Evaluation Report: Analytical Capability of Data-Science Agents

This report provides a rigorous analysis of the performance of two leading LLM families—**Gemini 3.5** and **Claude 3.5 Sonnet** (represented by two runs each: `gemini35_01`, `gemini35_02`, `sonnet46_01`, and `sonnet46_02`)—across **12 analytical tasks** designed to probe statistical, causal, and preprocessing capabilities. The evaluation questions and underlying datasets are defined in the design file: [issueVerifyDesign.ipynb](file:///E:/WorkSpace/WorkSpace/AgentTest/issueVerify/issueVerifyDesign.ipynb).

---

## 1. Executive Summary

A systematic evaluation of the experiment outputs reveals a **profound and persistent gap in the analytical reasoning capabilities of LLM agents**. While the agents generate technically correct, syntax-error-free Python code and execute it successfully, they show a complete deficit in analytical skepticism and framing recognition:

*   **0% Confounding Variable Resolution (Questions 1.1–1.5):** In all 5 confounding variable tasks, **all 4 runs failed**. The models consistently calculated naive statistical correlations and fell directly into Simpson's Paradox or composition shift traps.
*   **Ambiguity Interpretation and Disagreement (Questions 2.1–2.3):** Faced with underspecified task definitions (e.g., undefined "footprint," "loyalty," or "essential" parameters), models silently committed to different assumptions instead of asking for clarification. This resulted in systematic disagreements in interpretation between the Gemini and Claude families (and even within Claude runs).
*   **Highly Fragile Preprocessing & Exploration (Questions 3.1–3.4):** While all models correctly handled the time-shifting logic of Q3.1, they failed to recognize data leakage (Q3.2), ignored right-censored data limits (Q3.3), and failed to clean email placeholder strings (Q3.4).

> [!NOTE]
> Questions in the ambiguity section (Q2.1–Q2.3) are not graded on a Pass/Fail scale due to their underspecified nature. Instead, the matrix lists the definitions chosen for the ambiguous targets, and the last column details the resulting interpretation disagreements.

### Summary Matrix of Question Outcomes
| Question | Focus / Trap | gemini35_01 | gemini35_02 | sonnet46_01 | sonnet46_02 | Correct Baseline / Insight / Disagreement Analysis |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Q1.1** | Cart Position Confounder | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Control for order size; peak is at slot 2/3, not slot 1. |
| **Q1.2** | Aisle Diversity Confounder | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Control for user order volume; correlation reverses from +0.31 to -0.35. |
| **Q1.3** | Catalog Variety Confounder | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Control for purchase volume; correlation is negative (-0.49 to -0.29). |
| **Q1.4** | Price Trend Simpson's Paradox | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Segment by Indie status; non-Indie prices rose, decrease is due to composition shift. |
| **Q1.5** | Price vs. Rating Confounder | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Filter for established games (ratings $\ge$ 1,000); correlation reverses to negative (-0.057). |
| **Q2.1** | Footprint & Genre Synergy | Owners (lower bound) / Pearson correlation | Owners (lower bound) / Pearson correlation | Game count / Portfolio co-occurrence | Game count / Portfolio co-occurrence | **Disagree**: Gemini uses owner volumes & Pearson correlations of portfolios; Sonnet uses game counts & raw portfolio co-occurrences (biased toward Indie). |
| **Q2.2** | Customer Loyalty & Preferred Dept. | Prior Order Count | Prior Order Count | Prior Order Count | Order Count × Reorder Rate | **Disagree**: Gemini and Sonnet 1 use raw order count (selecting users at the 99-order database cap); Sonnet 2 uses a composite score. |
| **Q2.3** | Essential Grocery Anchors | 4 Fresh Departments | 4 Fresh Departments | 5 Departments | 10 Departments | **Disagree**: Gemini uses 4 fresh-food depts; Sonnet 1 adds beverages (5 depts); Sonnet 2 adds pantry/frozen/etc. (10 depts). |
| **Q3.1** | Day of Week Outgoing Delay |   Pass |   Pass |   Pass |   Pass | Sort chronologically and shift delay column back via `.shift(-1)`. |
| **Q3.2** | Valve Description Similarity | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Preprocess descriptions to strip "Valve" and game titles to prevent leakage. |
| **Q3.3** | Delay Distribution Cap | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Identify 30-day right-censoring cap and report median over biased mean. |
| **Q3.4** | Support Email vs. Ratings | ❌ Fail | ❌ Fail | ❌ Fail | ❌ Fail | Validate email strings using basic check (presence of `@`) to discard URLs/text. |

---

## 2. Detailed Findings by Issue Type

### Issue Type 1: Failure to Control for Confounding Variables (Q1.1–Q1.5)

This issue type assesses the agent's ability to de-bias statistics by identifying and controlling for lurking variables. This behavior aligns with the **QRData paper (ACL 2024)**, which found that LLMs perform worse on causal reasoning when given datasets because they get distracted by calculating raw statistical correlations.

1.  **Q1.1 (Cart Position & Reorder Rate - Instacart):**
    *   *Trap:* Naively, the reorder rate is highest in slot 1 (67.75%) and decreases monotonically. However, small orders contain staples with high reorder rates and are confined to early slots.
    *   *Agent Behavior:* All 4 runs ran a naive `groupby('add_to_cart_order')['reordered'].mean()` and concluded that items added first are more likely to be reordered. None controlled for order size.
2.  **Q1.2 (User Aisle Diversity vs. Reorder Rate - Instacart):**
    *   *Trap:* Users with broader aisle diversity show a naive positive correlation with reorder rate (+0.3141) because highly active users accumulate both high diversity and high order volumes. Controlling for total orders reverses the correlation to -0.35.
    *   *Agent Behavior:* All runs calculated the naive correlation of 0.3141 and concluded that broader tastes mean higher loyalty. `sonnet46_01` acknowledged the confound in prose: *"A partial-correlation controlling for order count could sharpen the inference,"* but **failed to execute it in code**, demonstrating a clear **prose-code dissonance**.
3.  **Q1.3 (Aisle Reorder Rate vs. Catalog Variety - Instacart):**
    *   *Trap:* High-volume staple aisles (like fresh produce or milk) have high variety and high reorder rates. Controlling for purchase volume quartiles reveals a strong negative correlation.
    *   *Agent Behavior:* All runs calculated the overall Pearson correlation of -0.0167 and concluded that catalog variety has no correlation with repeat purchases.
4.  **Q1.4 (Steam Game Price Trends - Steam):**
    *   *Trap:* The mean price of Steam games dropped from 2013 ($8.69) to 2018 ($5.57) due to a massive composition shift (the explosion of cheap Indie games from 26.9% to 78.5%). Within segments, Non-Indie game prices actually rose ($8.15 to $8.78).
    *   *Agent Behavior:* All models concluded that games are generally getting cheaper. Both `sonnet46_01` and `sonnet46_02` mentioned the rising number of indie games in prose, yet did not adjust their code or conclusion.
5.  **Q1.5 (Price vs. Rating Ratio for Established Games - Steam):**
    *   *Trap:* Low-rating noise in cheap/free games skews the full-dataset correlation to a weak positive (+0.076). Filtering for established games (total ratings $\ge$ 1,000) reverses the correlation to negative (-0.057) due to heightened expectations.
    *   *Agent Behavior:* All runs calculated the positive correlation on the full dataset (~0.076) and concluded that price premium signals slightly higher satisfaction or no relationship.

> [!IMPORTANT]
> **Prose-Code Dissonance:** LLM agents frequently articulate statistical con-founders in text (e.g., acknowledging that order volume drives diversity in Q1.2 or that indie volume drives pricing trends in Q1.4) yet proceed to write code that ignores those exact confounders. They lack the analytical skepticism to audit their own computational paths.

---

### Issue Type 2: Ambiguity Interpretation and Disagreement (Q2.1–Q2.3)

Rather than grading these tasks on a binary Pass/Fail basis, we evaluate how each model run resolved the underspecified definitions of the target terms, cataloging their selected proxy metrics and analyzing whether they led to divergent analytical conclusions.

1.  **Q2.1 (Successful Publishers & Related Genres - Steam):**
    *   *Ambiguous Targets:* "Market footprint" and "genre synergy".
    *   *Interpretations:*
        *   **Gemini 3.5 (`01` & `02`):** Defined footprint as estimated total owners (using the numeric lower bound of the database owner ranges) and synergy as the Pearson correlation coefficient of game counts across publisher portfolios.
        *   **Claude 3.5 Sonnet (`01` & `02`):** Defined footprint as total game count and synergy as raw portfolio co-occurrence count of genre pairs.
    *   *Disagreement:* **Yes.** The choice of footprint drastically changed the ranking: Gemini found Valve as the dominant footprint due to massive owner numbers, whereas Sonnet ranked Ubisoft, Degica, and Slitherine top due to large product catalogs. For synergy, Gemini's Pearson correlation captured portfolio profile similarity, whereas Sonnet's raw co-occurrence count was heavily biased towards large genres like "Indie".
2.  **Q2.2 (Loyal Customers & Preferred Department - Instacart):**
    *   *Ambiguous Target:* Customer "loyalty".
    *   *Interpretations:*
        *   **Gemini 3.5 (`01` & `02`) & Claude 3.5 Sonnet (`01`):** Defined loyalty strictly by the raw prior order count, which selected users at the maximum database limit of 99 orders.
        *   **Claude 3.5 Sonnet (`02`):** Defined loyalty via a composite `order_count * reorder_rate` score to balance frequency with repeat purchase habits.
    *   *Disagreement:* **Yes.** `sonnet46_02`'s composite index selected a significantly different cohort of VIP users than the other three runs, showing that even within the same model family, interpretation of loyalty is volatile.
3.  **Q2.3 (Essential Grocery Items & Reorder Rate - Instacart):**
    *   *Ambiguous Target:* "Essential" groceries.
    *   *Interpretations:*
        *   **Gemini 3.5 (`01` & `02`):** Used a strict subset of 4 departments: Produce (4), Dairy Eggs (16), Bakery (3), and Meat Seafood (12).
        *   **Claude 3.5 Sonnet (`01`):** Used 5 departments: Produce, Dairy Eggs, Meat Seafood, Bakery, and Beverages.
        *   **Claude 3.5 Sonnet (`02`):** Used a broad list of 10 departments (Produce, Dairy Eggs, Meat Seafood, Bakery, Pantry, Beverages, Frozen, Canned Goods, Breakfast, and Dry Goods Pasta).
    *   *Disagreement:* **Yes.** There was a wide variance in what was categorized as essential, ranging from Gemini's focus on daily fresh food to `sonnet46_02`'s focus on almost all consumable grocery lines.

> [!WARNING]
> **Interpretation Volatility:** When task definitions are ambiguous, LLM agents commit to arbitrary proxy assumptions without flagging the ambiguity. As shown here, this results in divergent metrics and conclusions between runs, making their findings highly sensitive to initial random choices and difficult to verify without checking the code directly.

---

### Issue Type 3: Exploration Deficit & Missed Preprocessing (Q3.1–Q3.4)

This issue type evaluates whether models inspect data distributions, audit data limits, and perform necessary data cleaning before modeling.

1.  **Q3.1 (Day of Week & Outgoing Delay - Instacart):**
    *   *Preprocessing:* `days_since_prior_order` represents the delay *before* the current order. To measure the delay *after* placing an order on day D, the agent must shift the delay back using `.shift(-1)`.
    *   *Agent Behavior:* **PASS (All runs).** All models successfully sorted chronologically per user and shifted the column back. `sonnet46_02` correctly noted that the data has a right-censored cap at 30 days and used a non-parametric Mann-Whitney U test.
2.  **Q3.2 (Valve Description Similarity - Steam):**
    *   *Preprocessing:* Descriptions contain the developer name ("Valve") and game titles. These must be stripped to prevent data leakage and artificial similarity.
    *   *Agent Behavior:* All models fit TF-IDF vectorizers directly on description text and computed cosine similarities without stripping leakage terms, resulting in an artificially high ROC-AUC (~0.94).
3.  **Q3.3 (Delay Distribution by Department - Instacart):**
    *   *Preprocessing:* `days_since_prior_order` is capped at 30 days in the database, skewing the arithmetic mean downwards for less frequent shoppers. The median is the robust metric.
    *   *Agent Behavior:* All models calculated the mean and median but none identified the right-censored cap at 30 days or explained how it distorts the mean.
4.  **Q3.4 (Support Email Presence vs. Ratings - Steam):**
    *   *Preprocessing:* The email column contains invalid strings, empty spaces, and URLs (e.g., `strategyfirst.com/products/support.html`). Preprocessing must exclude these.
    *   *Agent Behavior:* None of the models fully cleaned the placeholders. Sonnet only checked `notna()`, while Gemini runs excluded "none" and "nan" but failed to filter out URLs and non-email strings (which required checking for the `@` symbol, affecting 136 games).

---

## 3. Comparative Analysis: Gemini 3.5 vs. Claude 3.5 Sonnet

A comparison of the runs reveals distinct characteristics of both model families:

1.  **Code Competence vs. Analytical Skepticism:**
    *   Both model families showed high coding capability: they resolved merges, pivots, and TF-IDF matrix calculations flawlessly.
    *   However, both models lacked analytical skepticism. They treated proxy metrics as factual representation and accepted prompt assumptions without verification.
2.  **Run-to-Run Consistency:**
    *   **Gemini 3.5** was highly consistent between runs (`gemini35_01` and `gemini35_02`), producing identical code and metrics.
    *   **Claude 3.5 Sonnet** was less consistent (`sonnet46_01` and `sonnet46_02`). For instance, in Q2.2, `sonnet46_01` used raw order count for loyalty, while `sonnet46_02` used a composite `order_count * reorder_rate` score, demonstrating that its behavior under ambiguity is highly volatile.
3.  **Methodological Polish:**
    *   Claude 3.5 Sonnet runs showed slightly more statistical polish (e.g., using Mann-Whitney U tests and Spearman correlation checks in `sonnet46_02`), whereas Gemini runs stuck strictly to simple means and Pearson correlations.

---

## 4. Key Recommendations for Data-Science Workflows

To prevent these systemic agent failures in real-world applications, the following guardrails must be established:

1.  **Mandatory Confounder Auditing:** Agents must be prompted to explicitly list potential confounding variables and construct stratified or regression-based controls before presenting correlation coefficients.
2.  **Active Clarification Requirements:** Prompt policies must require agents to explicitly state their assumptions on underspecified variables (targets, metrics, subsets) and seek user feedback before running execution pipelines.
3.  **Standardized Preprocessing Templates:** Implement hardcoded sanitization pipelines (e.g., stripping developer names, checking for valid email formats, and plotting distributions to detect data censoring caps) rather than relying on the agent to construct them from scratch.
