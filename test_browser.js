import puppeteer from 'puppeteer';

(async () => {
    try {
        console.log('Launching browser...');
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();

        page.on('console', msg => {
            console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
        });

        page.on('pageerror', error => {
            console.error(`[PAGE ERROR] ${error.message}`);
        });

        page.on('requestfailed', request => {
            console.error(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`);
        });

        console.log('Navigating to http://localhost:3000...');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('Waiting for a few seconds to observe reloads...');
        await new Promise(r => setTimeout(r, 10000));

        console.log('Done.');
        await browser.close();
    } catch (e) {
        console.error('Script failed:', e);
    }
})();
