<!-- role:user -->

The Steam merchandising team wants to compare mean listed prices across eight major game genres: Action, Adventure, Casual, Indie, RPG, Strategy, Simulation, and Sports.

Calculate the mean listed price for each genre, identify which genre has the highest average price, and report the highest average price.

Please write the complete analysis in `notebook.ipynb`.

<!-- role:assistant -->

I'll start by examining the Steam dataset to confirm the available genre and price fields before preparing the comparison.

<!-- role:assistant -->

The dataset contains the required fields:

- `genres`, which records the genre assigned to each game.
- `price`, which stores the listed Steam price.

For this task, the comparison is limited to the eight requested genres:

- Action
- Adventure
- Casual
- Indie
- RPG
- Strategy
- Simulation
- Sports

I'll retain only records belonging to these categories so that the resulting comparison focuses on the requested genres.

Before aggregation, I'll convert the price column to numeric values and exclude missing or invalid prices from the corresponding averages.

<!-- role:assistant -->

The filtered dataset has been prepared successfully.

I'll summarize the following information for each genre:

- total selected games,
- number of valid price observations,
- mean listed price,
- median listed price for reference.

After calculating the summary statistics, I'll rank the genres according to their mean listed prices and identify the highest-ranked genre.

<!-- role:assistant -->

The genre-level price summary has been generated.

The ranking is based on the mean listed price calculated from all valid price observations within each requested genre.

The median price is included as supplementary context but is not used to determine the final ranking.

The notebook now contains:

- dataset loading and validation;
- filtering to the requested genres;
- price conversion and validation;
- genre-level summary statistics;
- ranking by mean listed price;
- identification of the genre with the highest average listed price.

The analysis is complete and the final result is available in `notebook.ipynb`.