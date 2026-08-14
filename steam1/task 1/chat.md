<!-- role:user -->

The Steam merchandising team wants to compare mean listed prices across eight major game genres: Action, Adventure, Casual, Indie, RPG, Strategy, Simulation, and Sports.

Calculate the mean listed price for each genre, identify which genre has the highest average price, and report the highest average price.

Please write the complete analysis in `notebook.ipynb`.

<!-- role:assistant -->

I'll inspect the Steam dataset and confirm the genre and price fields needed for the comparison.

<!-- role:assistant -->

The required fields are available. Before filtering to the requested genres, I'll inspect how genre assignments are represented in the dataset.

<!-- role:assistant -->

Many games have multiple genre labels in the `genres` field. I'll split these assignments so that each game is represented in every requested genre to which it belongs.

<!-- role:assistant -->

I'll retain the eight requested genres, convert `price` to numeric values, and exclude missing or invalid prices from the corresponding averages.

<!-- role:assistant -->

I'll calculate the number of games, mean listed price, and median listed price for each genre using the expanded genre assignments.

<!-- role:assistant -->

I'll rank the eight genres by mean listed price and identify the genre with the highest average price.

<!-- role:assistant -->

I'll also visualize the number of games represented in each genre so the genre-level sample sizes can be compared.

<!-- role:assistant -->

The notebook now contains the genre inspection and preparation, genre-level price statistics, ranking, visualization, and final result identifying the genre with the highest average listed price.