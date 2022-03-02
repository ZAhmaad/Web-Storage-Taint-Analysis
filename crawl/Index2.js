(async () => {

    require("dotenv").config();
    if (!process.env.PROXY_SPKI_FINGERPRINT) {
        throw new Error("PROXY_SPKI_FINGERPRINT is not defined in environment.");
    }

    const fs = require("fs");
    const fsPromises = fs.promises;
    const pptr = require("puppeteer");


    const sites = (await fsPromises.readFile(process.argv[2]))
        .toString()
        .split("\n")
        .map(line => line.split(",")[1])
        .filter(s => s);

    const crawlerProms = sites.map(async (site, index) => {
        try {
            console.log(`[${index}] ${site}`);
            await fsPromises.appendFile("data1.txt", JSON.stringify(await crawlerNewInstance(site)) + "\n");
            await fsPromises.appendFile("data2.txt", JSON.stringify(await crawlerNewInstance(site)) + "\n");
        } catch(e) {
            console.log(e);
        }
    });
    await Promise.all(crawlerProms)

    async function crawlerNewInstance(site) {
        const browser = await pptr.launch({
            args: [
                "--proxy-server=https://127.0.0.1:8000",
                "--ignore-certificate-errors-spki-list=" + process.env.PROXY_SPKI_FINGERPRINT,
                "--disable-web-security",
            ],
            // headless: false,
            
    
        });
        const result = await crawl(browser, site)
        await browser.close()
        return result
    }
    


    async function crawl(browser, site) {
        const page = await browser.newPage();

        try {
            const grepResult = [];

            page.on("request", async request => {
                request.continue();
            })

            page.on("response", async response => {
                try {
                    if (response.request().resourceType() === "script" &&
                        response.headers()["content-type"] &&
                        response.headers()["content-type"].includes("javascript")) {
                            const js = await response.text();
                            const grepPartResult = grepMagicWords(js);
                            grepResult.push([response.request().url(), grepPartResult]);
                    }
                } catch (e) {}
            });

            await page.setRequestInterception(true);

            try {
                await page.goto("http://" + site, {waitUntil: "load", timeout: 60000});
                await new Promise(resolve => { setTimeout(resolve, 10000); });
            } catch (e) { console.error(e); }

            const [flows, url] = await Promise.race([
                page.evaluate(() => [J$.FLOWS, document.URL]),
                new Promise((_, reject) => { setTimeout(() => { reject(); }, 5000); })
            ]);

            return {url: url, grepResult: grepResult, flows: flows};
        } finally {
            await page.close();
        }

        function grepMagicWords(js) {
            var re = /(?:\'|\")(?:g|s)etItem(?:\'|\")/g, match, result = [];
            while (match = re.exec(js)) {
                result.push(js.substring(match.index - 100, match.index + 100));
            }
            return result;
        }
    }

})();
