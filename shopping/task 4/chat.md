<!-- role:user -->

Our supply chain director believes that Produce should receive the next catalog expansion budget because it has the broadest product assortment.

Before approving the proposal, the VP of Supply Chain has requested a short decision memo based on the Instacart dataset.

Render the memo as HTML in `notebook.ipynb`.

Please report:

* the number of departments and aisles;
* the average number of unique products per aisle;
* the department with the largest product assortment;
* Produce's rank by product count;
* the top five departments by product count.

Finish with a brief recommendation for the VP.

<!-- role:assistant -->

I'll inspect the Instacart product catalog and identify the files needed to summarize department- and aisle-level product information.

<!-- role:assistant -->

The analysis requires three files:

* `products.csv`, which maps products to departments and aisles;
* `departments.csv`, which provides department names;
* `aisles.csv`, which provides aisle names.

I'll use these files to compute the requested catalog statistics and evaluate the director's proposal.

<!-- role:assistant -->

The director's claim that Produce has the broadest product assortment should be verified using the computed catalog statistics rather than assumed.

I'll calculate the product counts for every department, determine Produce's ranking, and compare it with the leading departments before making a recommendation.

<!-- role:assistant -->

I'll render the results as a formatted HTML memo, including the requested summary statistics, comparison table, and a recommendation based on the computed evidence.

<!-- role:assistant -->

The notebook now contains:

* loading and validation of the required catalog files;
* calculation of department- and aisle-level catalog statistics;
* Produce's product-count ranking;
* the top five departments by product assortment;
* and an HTML decision memo with a recommendation supported by the computed results.
