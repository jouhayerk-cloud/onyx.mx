
import { onyxQueries } from './src/features/onyx/onyxQueries.ts';

async function run() {
    try {
        const res = await onyxQueries.searchInventory({ query: 'bear wall panel' });
        console.log(JSON.stringify(res.items, null, 2));
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
