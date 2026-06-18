# Agent Evaluation Report: Claude 3.5 Sonnet on Instacart Dataset Tasks

## Executive Summary

Across both attempts, Claude 3.5 Sonnet exhibited strong programming capabilities—correctly executing complex data joins, performing window-based temporal shifts, handling large data tables without memory exhaustion, and producing clear visual plots. However, **the agent repeatedly fell into analytical traps designed to test its structural discipline and depth of insight**:

1. **Order-Size Confounding (Q1):** Both attempts fell directly into the basket-size trap. The agents noticed in their Chain of Thought that order size could be a confounding factor, yet both failed to write code to control for it, confidently reporting a strong negative correlation between cart position and reorder rate that is significantly exaggerated by small orders of essentials.
2. **Naive Weekend Encoding (Q2):** In Attempt 1, the agent blindly assumed that day-of-week codes 0 and 6 represented the weekend, failing to notice that the dataset's traffic peaks at days 0 and 1. Attempt 2 successfully resolved this by analyzing traffic volumes and identifying days 0 and 1 as the weekend.
3. **Incomplete Data Scope (Q4):** Attempt 1 failed to join the `prior` and `train` datasets, omitting each user's most recent order from the analysis and underreporting the median unique aisles visited as 25 (instead of the correct 26). Attempt 2 correctly concatenated both datasets before performing aggregations.
4. **Activity Confounding (Q4):** While both attempts correctly identified that the positive correlation between aisle diversity and user-level reorder rate is driven by the lurking variable of order volume (frequent shoppers accumulate more unique aisles and higher reorder rates), they failed to run a de-confounded analysis (e.g., aisles per order) to isolate the true relationship.

---

## Detailed Question-by-Question Analysis

### Question 1: Cart Position & Reorder Rate
* Does the order in which items are added to the shopping cart (`add_to_cart_order`) predict their reorder rate? Specifically, are products added first more likely to be reordered than products added later?
* **Design Consideration:** The relationship is confounded by basket size. Small orders (1–2 items) consist almost entirely of high-reorder staples (milk, bananas), inflating the reorder rate at low cart positions. To isolate the true correlation, the agent must control for total order size.

| Metric / Aspect | Attempt 1 (`AgentTest1.ipynb`) | Attempt 2 (`AgentTest2.ipynb`) |
| :--- | :--- | :--- |
| **Methodology** | Grouped by `add_to_cart_order`, capped at 20 positions, Pearson correlation. | Grouped by `add_to_cart_order`, kept all positions with ≥ 1,000 items (59 positions), Pearson correlation. |
| **Basket-Size Control** | **FAILED.** Identified the confound in Chain of Thought but did not write code to control for it. | **FAILED.** Identified the confound in Chain of Thought but did not write code to control for it. |
| **Key Metrics** | Pearson r = -0.979, Position 1: 67.8%, Position 20: 48.0%. Positions 1–5: 65.5% vs. 6+: 53.8%. | Pearson r = -0.878, Positions 1–3: 67.1%, 4–10: 59.0%, 11–20: 50.8%. Overall prior reorder rate: 59.0%. |

#### Q1 Evaluation & Pitfall Analysis
Both attempts failed to implement any statistical controls for order size. Although both agents wrote extensive Chain-of-Thought markdown explaining that basket size and user activity level act as confounding variables, they bypassed this skepticism in their code. They proceeded with simple population-level aggregations and reported near-perfect negative correlations. To successfully bypass this trap, the agent should have grouped the orders by total size (e.g., orders with exactly 5 items, exactly 10 items) and demonstrated how the reorder-to-position curve flattens or shifts within those subsets.

---

### Question 2: Day of Week & Outgoing Delay
* Does the day of the week on which an order is placed affect how long a customer waits before placing their next order? Specifically, are orders placed on weekends followed by a shorter delay than orders placed on weekdays?
* **Design Consideration:** The column `days_since_prior_order` represents the delay *before* the current order. To measure the delay *after* the current order, the agent must chronologically sort orders per user and apply a `.shift(-1)` window operation. It must also handle the undocumented `order_dow` encoding and the right-truncation cap of 30 days.

| Metric / Aspect | Attempt 1 (`AgentTest1.ipynb`) | Attempt 2 (`AgentTest2.ipynb`) |
| :--- | :--- | :--- |
| **Temporal Shifting** | **PASS.** Sorted by `user_id` and `order_number` and applied `.shift(-1)`. | **PASS.** Sorted by `user_id` and `order_number` and applied `.shift(-1)`. |
| **Weekend Encoding** | **FAILED.** Blindly assumed DOW {0, 6} (Saturday/Sunday) without checking volumes. | **PASS.** Inspected traffic volume by DOW, identified DOW 0 and 1 as the peak days, and defined weekend as DOW {0, 1}. |
| **Key Metrics** | Weekend (0, 6) gap: 11.70 days (median 8). Weekday gap: 10.86 days (median 7). | Weekend (0, 1) gap: 11.40 days (median 7). Weekday gap: 10.96 days (median 7). |

#### Q2 Evaluation & Pitfall Analysis
Both attempts successfully navigated the temporal shift trap, correctly realizing that the delay following an order is stored in the next chronological order row. However, **Attempt 2 demonstrated superior analytical hygiene regarding the DOW encoding**. Attempt 1 naively applied the standard US calendar convention (0=Sunday, 6=Saturday) without testing this assumption. Attempt 2 inspected the day-of-week order volume, observed that days 0 and 1 represent the major weekend shopping peaks, and set the weekend filter to DOW {0, 1}, explicitly noting the lack of documentation in the metadata. Both agents correctly identified that weekend orders are actually followed by *longer* gaps (the opposite of the user's hypothesis), explaining this as weekend "bulk shopping" vs. weekday "mid-week top-ups".

---

### Question 3: Aisle First-Time Purchases & Variety
* Which aisle has the highest proportion of first-time purchases (i.e., `reordered == 0`) among all its order-product rows? Do aisles with more first-time purchases also tend to have a greater variety of distinct products ordered?
* **Design Consideration:** Joining order lines to product details creates a fan-out. To compute product variety correctly, the agent must count *distinct* products per aisle using `.nunique()`. Simply counting rows or using `.count()` will wildly inflate variety scores based on purchase volumes. It must also filter out low-volume aisles to prevent noise.

| Metric / Aspect | Attempt 1 (`AgentTest1.ipynb`) | Attempt 2 (`AgentTest2.ipynb`) |
| :--- | :--- | :--- |
| **Aisle Variety Logic** | **PASS.** Correctly used `.nunique(product_id)`. | **PASS.** Correctly used `.nunique(product_id)`. |
| **Noise Filtering** | Filtered to aisles with ≥ 1,000 purchases. | Filtered to aisles with ≥ 500 purchases. |
| **Top First-Time Aisle** | "spices seasonings" (84.8% first-time rate). | "spices seasonings" (84.8% first-time rate). |
| **Variety Correlation** | Pearson r = 0.017 (p = 0.85); Spearman rho = 0.040. | Pearson r = 0.017. |

#### Q3 Evaluation & Pitfall Analysis
Both attempts successfully avoided the fan-out trap by using `.nunique()` instead of `.count()` when measuring aisle variety. Both also correctly identified that there is **zero correlation** between the first-time rate of an aisle and its product variety (Pearson r = 0.017). They explained that repurchase rates are driven by the inherent nature of the product category (essential consumables like milk and fruit are reordered relentlessly, while spices are bought once for specific recipes) rather than catalog depth.

---

### Question 4: Aisle Diversity & Reorder Rate
* What is the median number of unique aisles a user shops from across all their orders? Do users who shop from more diverse aisles (high aisle diversity) show a lower overall reorder rate than users who stick to a narrow set of aisles?
* **Design Consideration:** The phrase "across all their orders" requires combining `order_products__prior` and `order_products__train`. Aisle diversity must be calculated cumulatively at the user level, not averaged across orders. The relationship is heavily confounded by user order volume: highly active users have more opportunities to visit new aisles *and* higher reorder rates, creating a spurious positive correlation.

| Metric / Aspect | Attempt 1 (`AgentTest1.ipynb`) | Attempt 2 (`AgentTest2.ipynb`) |
| :--- | :--- | :--- |
| **Data Scope (Union)** | **FAILED.** Used only the `prior` dataset, omitting the `train` dataset. | **PASS.** Correctly concatenated `df_order_prior` and `df_order_train`. |
| **Confounding Variable** | **PASS.** Identified order volume as the driver of the positive correlation. | **PASS.** Identified order volume as the driver of the positive correlation. |
| **Median Unique Aisles** | 25 aisles (skewed downward due to missing data). | 26 aisles (correct). |
| **Diversity Correlation** | Pearson r = +0.314, Spearman rho = +0.298. | Pearson r = +0.274. |
| **Comparison Groups** | Narrow (≤18 aisles) mean reorder rate 37.6% vs. Broad (≥33 aisles) 52.2%. | Low diversity (≤26 aisles) mean 39.7% vs. High diversity (>26 aisles) 49.2%. |

#### Q4 Evaluation & Pitfall Analysis
* **Scope Trap:** Attempt 2 was superior because it correctly recognized that a user's "entire order history" requires combining the `prior` and `train` transaction tables. Attempt 1's omission of the `train` set resulted in an undercount of every user's total unique aisles, leading to a median value of 25 instead of 26.
* **Lurking Variable Trap:** Both agents successfully identified the critical order volume confound. They realized that active power users place many orders, which simultaneously inflates their cumulative unique aisle counts and their reorder rates. Both correctly pointed out that the positive correlation is a statistical artifact of user activity, reversing the naive expectation that "diverse shopping = low loyalty". However, neither agent went the extra mile to run a de-confounded analysis (such as comparing unique aisles per order) to isolate the true relationship.

---

## Key Takeaways for Agent Design and Testing

1. **Failure to Operationalize Skepticism:** The evaluation shows that LLM agents often possess the *conceptual* knowledge to identify statistical confounds (such as basket-size in Q1 and order volume in Q4) and write about them in text, but they fail to translate this awareness into *corrective action* in their code. Guardrails or prompts must force agents to actively test for and de-confound lurking variables.
2. **Assumption Auditing:** Agents frequently apply prior assumptions (like US calendar week mappings in Q2) to undocumented variables. Benchmarks should include variables with ambiguous or shifted encodings to test whether an agent validates its assumptions before executing analysis.
3. **Data Scope Audits:** In multi-table relational databases, agents can easily overlook split tables (like `prior` and `train` splits in Q4) that represent distinct slices of chronological data. Evaluation tasks must test whether agents audit the record relationships and construct a complete view of the user history.
