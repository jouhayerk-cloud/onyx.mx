export interface EvalCase {
    query: string;
    relevant: string[];
}

export interface PerQueryEval {
    query: string;
    recall: number;
    rr: number;
}

export interface EvalRankingResult {
    recallAtK: number;
    mrr: number;
    perQuery: PerQueryEval[];
}

/**
 * Evaluates ranking retrieval quality (Recall@K and MRR) across evaluation test cases.
 *
 * @param cases - Array of evaluation cases containing queries and relevant document IDs.
 * @param search - Asynchronous search function returning candidate hit IDs for a query.
 * @param k - Number of top results considered for Recall@K cutoff (default is 10).
 * @returns Ranking evaluation metrics including recallAtK, mrr, and perQuery breakdowns.
 */
export async function evaluateRanking(
    cases: EvalCase[],
    search: (query: string) => Promise<string[]>,
    k = 10
): Promise<EvalRankingResult> {
    if (!cases || cases.length === 0) {
        return { recallAtK: 0, mrr: 0, perQuery: [] };
    }

    const perQuery: PerQueryEval[] = [];

    for (const c of cases) {
        if (!c.relevant || c.relevant.length === 0) {
            continue;
        }

        const relevantSet = new Set(c.relevant);
        if (relevantSet.size === 0) {
            continue;
        }

        const hits = (await search(c.query)) ?? [];
        const topK = hits.slice(0, Math.max(0, k));

        let relevantFoundInTopK = 0;
        for (const relId of relevantSet) {
            if (topK.includes(relId)) {
                relevantFoundInTopK++;
            }
        }
        const recall = relevantFoundInTopK / relevantSet.size;

        let rr = 0;
        for (let i = 0; i < hits.length; i++) {
            if (relevantSet.has(hits[i])) {
                rr = 1 / (i + 1);
                break;
            }
        }

        perQuery.push({
            query: c.query,
            recall,
            rr
        });
    }

    if (perQuery.length === 0) {
        return { recallAtK: 0, mrr: 0, perQuery: [] };
    }

    const totalRecall = perQuery.reduce((sum, item) => sum + item.recall, 0);
    const totalRr = perQuery.reduce((sum, item) => sum + item.rr, 0);
    const count = perQuery.length;

    return {
        recallAtK: totalRecall / count,
        mrr: totalRr / count,
        perQuery
    };
}
