<!-- role:user -->

The merchandising analytics team wants to understand how frequently different product departments are purchased together with Produce.

Use the prior purchase history and compare departments using co-purchase counts.

The relevant files are:

* `order_products__prior.csv`, containing the products purchased in each order;
* `products.csv`, mapping products to departments;
* `departments.csv`, containing department names.

Please write the complete analysis in `notebook.ipynb`.

<!-- role:assistant -->

I'll inspect the three Instacart files and identify the fields needed to connect purchased products with their departments.

<!-- role:assistant -->

The purchase-history file contains one row for each product included in an order.

The product table maps each `product_id` to a `department_id`, and the department table provides the corresponding department names.

I'll join these files so that every purchased product is associated with its department.

<!-- role:assistant -->

I'll first identify the orders containing at least one product from the Produce department.

These orders will define the set of Produce baskets used for the co-purchase analysis.

<!-- role:assistant -->

Next, I'll retain all purchased products appearing in the Produce orders and count the number of purchases associated with each department.

Produce itself will be excluded from the final comparison so that the results focus on other departments purchased alongside it.

<!-- role:assistant -->

I'll rank departments by their resulting co-purchase counts and create a bar chart showing which departments are purchased most frequently in Produce orders.

The analysis will also report the number of Produce orders and the total number of purchase records included in the comparison.

<!-- role:assistant -->

The notebook now contains:

* loading and validation of the three Instacart files;
* mapping products to departments;
* identification of orders containing Produce;
* counting department purchases within Produce orders;
* ranking departments by co-purchase count;
* and a visualization of the leading departments.

The completed analysis is available in `notebook.ipynb`.
