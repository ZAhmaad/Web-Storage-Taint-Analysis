(async () => {

    require("dotenv").config();
    if (!process.env.PROXY_SPKI_FINGERPRINT) {
        throw new Error("PROXY_SPKI_FINGERPRINT is not defined in environment.");
    }

    const fs = require("fs");
    const fsPromises = fs.promises;
    const chromeCookies = require("chrome-cookies-secure");
    const pptr = require("puppeteer");

    const browser = await pptr.launch({
        args: [
            "--proxy-server=https://127.0.0.1:8000",
            "--ignore-certificate-errors-spki-list=" + process.env.PROXY_SPKI_FINGERPRINT,
            "--disable-web-security",
        ],
        // headless: false,
    });

    const sites = (await fsPromises.readFile(process.argv[2]))
        .toString()
        .split("\n")
        .map(line => line.split(",")[1])
        .filter(s => s);

    for (let i in sites) {
        const domain = sites[i];
        const url = "https://" + domain;
        console.log(`[${i}] ${url}`);
        try {
            await fsPromises.appendFile("out.txt", JSON.stringify(await crawl(browser, url, domain)) + "\n");
        } catch (e) {
            console.error(e);
        }
    }

    await browser.close();

    async function crawl(browser, url, domain) {
        const page = await browser.newPage();

        try {
            const cookies = await new Promise((resolve, reject) => {
                chromeCookies.getCookies(url, "puppeteer", function () {
                    chromeCookies.getCookies(url, 'puppeteer', function (err, cookies) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        cookies.forEach(cookie => {
                            if (cookie["HttpOnly"]) {
                                cookie["httpOnly"] = cookie["HttpOnly"];
                                delete cookie["HttpOnly"];
                            }
                            if (cookie["Secure"]) {
                                cookie["secure"] = cookie["Secure"];
                                delete cookie["Secure"];
                            }
                            if (cookie["SameSite"]) {
                                cookie["sameSite"] = cookie["SameSite"];
                                delete cookie["SameSite"];
                            }
                        });
                        resolve(cookies);
                    }, "Default");
                });
            });
            await page.setCookie(...cookies);

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
                await page.goto(url, {waitUntil: "load", timeout: 60000});
                await new Promise(resolve => { setTimeout(resolve, 10000); });
            } catch (e) { console.error(e); }

            const flows = await Promise.race([
                page.evaluate(() => J$.FLOWS),
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
