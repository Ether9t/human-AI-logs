<!-- role:user -->

The merchandising analytics team wants to understand how frequently different departments are purchased together with Produce.

Use the prior purchase history and compare departments using co-order counts.

Please write the complete analysis in `notebook.ipynb`.

<!-- role:assistant -->

I'll inspect the Instacart purchase, product, and department files and identify the fields needed for the co-order analysis.

<!-- role:assistant -->

The required fields are available. I'll map each purchased product to its department using the product and department tables.

<!-- role:assistant -->

Next, I'll identify all orders containing at least one Produce product. These orders will define the Produce purchase history used for the comparison.

<!-- role:assistant -->

Within the Produce orders, I'll retain purchases from other departments and calculate their co-order counts.

<!-- role:assistant -->

I'll rank departments by co-order count and report the departments most frequently purchased alongside Produce.

<!-- role:assistant -->

I'll visualize the leading departments and include the number of Produce orders and purchase records represented in the analysis for context.

<!-- role:assistant -->

The notebook now contains the department mapping, Produce-order identification, co-order counts, department ranking, visualization, and final comparison.
