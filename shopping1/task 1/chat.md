<!-- role:user -->

The merchandising analytics team wants to understand how frequently different product departments are purchased together with Produce.

Use the prior purchase history and compare departments using co-purchase counts.

Please write the complete analysis in `notebook.ipynb`.

<!-- role:assistant -->

I'll inspect the Instacart purchase, product, and department files and connect each purchased product to its department.

<!-- role:assistant -->

The required fields are available. I'll identify all orders containing Produce and use those orders as the basis for the co-purchase comparison.

<!-- role:assistant -->

To measure department co-purchases at the basket level, I'll count each department at most once within a Produce order so that multiple items from the same department do not create duplicate co-purchases.

<!-- role:assistant -->

I'll calculate the number of Produce orders containing each other department, rank the departments by co-purchase count, and compare the leading results.

<!-- role:assistant -->

I'll visualize the leading departments and include the number of Produce orders alongside the highest department count to provide context for the comparison.

<!-- role:assistant -->

The notebook now contains the Produce-order identification, basket-level department co-purchase counts, ranking, visualization, and final result.