
import { onyxQueries } from '../src/features/onyx/onyxQueries';

async function testContext() {
    try {
        console.log("Fetching Database Context...");
        const context = await onyxQueries.getDatabaseContext();
        console.log("SHAPES found:", context.shapes);
        console.log("COLORS found:", context.colors);
        console.log("MATERIALS found:", context.materials);
        console.log("TOTAL ITEMS:", context.total_items);
    } catch (e) {
        console.error("Error fetching context:", e);
    }
}

testContext();
