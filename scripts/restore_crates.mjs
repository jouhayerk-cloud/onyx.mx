import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yircifkayqpuydfdqzlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpcmNpZmtheXFwdXlkZmRxemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODE4NzgsImV4cCI6MjA4NzQ1Nzg3OH0.AAo7z8J4798J25Wu-7EDI78zC2OY6k7C8pdGKBo07b8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ids = [
    '0e0f5592-61d4-4c21-8f80-99f42aa295bb',
    '33e59e96-ccd7-42ab-8c80-949b86c12859',
    '2d39ed2d-7f8e-4516-b273-734e1b6169a5',
    'ab4d8cde-b183-4779-aac9-00d19623cc23',
    'a4d9582d-bd6f-42a9-bbb3-2fdbff3a0329',
    '454d66b5-0eb3-4ef1-b5ed-5b0c800b63af',
    '37134d63-5af2-4a0b-80df-4ab73db6cc8f',
    '02f663f0-37c0-435e-9815-b410a40651ed',
    '74f33682-5820-4ebb-84a8-27d9d5f45f71',
    'd3e20dd4-71e4-4a91-b6b2-bd900888b661',
    '7e3731af-45b9-4aed-be94-595ae7f8f006',
    'ed087bfe-e781-41d3-aeff-2c1fdb5e2713'
];

async function restoreCrates() {
    const { error } = await supabase.from('logistics').update({ 
        status: 'Packed', 
        truck_id: null, 
        truck_position: null, 
        parent_id: null 
    }).in('id', ids);
    
    if (error) console.error(error);
    else console.log("Successfully restored 12 crates to Packed!");
}
restoreCrates();
