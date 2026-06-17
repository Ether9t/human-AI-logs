**Proposed Questions**
- Half-Life 2 is a game developed by Valve; it has a well-written Steam description, attracting players even before they start their games. This company has very iconic language for their game descriptions; can we identify other games developed by this company using only the similarity of game descriptions?
	This question implicitly requires data processing. **The description might contain the company name and need to be removed first.**

- We don’t have data on zero playtime in the dataset, but is it possible to infer major factors influencing zero playtime?
	This question simulates making inferences using existing data, which requires making hypotheses and intuition. **One mistake people might make is not taking this inference result as a hypothesis.** Some inferences: A high zero playtime rate would make average playtime lower than median playtime; a low total rating / owner ratio might imply a high zero playtime rate.

- Graphics of games are improving year by year; do hardware requirements also grow over time?
	This question needs parsing the hardware requirement string and joining two sheets on game ID. Also, the user needs to take a look at “pc-requirements” “minimal” and “recommended”. Agents might skip the exploration and pick a random field. Also, a careful analyst might consider game type as one factor, since only certain types of games would demand a very powerful graphics card. **When testing this problem, the agent didn't realize there's a separate requirement sheet and started inference using only the first table instead.**

- What are the most successful publishers for each game genre? Assuming a company would focus on some specific genres due to the accumulation of development experience, can you see which genres might be highly related?
	This question uses the ambiguous term "success". A careful analyst would consider what constitutes success and what type of success would be useful in this question. The second part of the question is also ambiguous; **the intuition is clear, but it is not easy to translate into a specific plan.**
