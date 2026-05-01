
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('am_items_full.json', 'utf8')).filter(i => !i.is_hidden);

const targetSum = 322700;
const targetCount = 27;

console.log(`Searching in ${items.length} items for ${targetCount} items that sum to ${targetSum}...`);

function getCombinations(array, size) {
    const result = [];
    function helper(start, combo) {
        if (combo.length === size) {
            result.push([...combo]);
            return;
        }
        for (let i = start; i < array.length; i++) {
            combo.push(array[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }
    helper(0, []);
    return result;
}

// Optimized combination sum search
function findCombination(array, size, target) {
    let found = false;
    function helper(start, count, currentSum, indices) {
        if (found) return;
        if (count === size) {
            if (Math.abs(currentSum - target) < 1) {
                console.log('FOUND MATCH!');
                console.log('Items:', indices.map(idx => array[idx].item_id).join(', '));
                console.log('Sum:', currentSum);
                found = true;
            }
            return;
        }
        if (start >= array.length) return;
        
        // Pruning (optional but good)
        // If remaining items * max_price + currentSum < target, return
        // If remaining items * min_price + currentSum > target, return
        
        for (let i = start; i <= array.length - (size - count); i++) {
            const price = Math.round(parseFloat(array[i].price_mxn || '0'));
            helper(i + 1, count + 1, currentSum + price, [...indices, i]);
        }
    }
    helper(0, 0, 0, []);
}

findCombination(items, targetCount, targetSum);
findCombination(items, targetCount, 322750); // Also search for what's currently shown
