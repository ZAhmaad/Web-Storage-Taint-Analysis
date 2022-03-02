(async () => {

    require("dotenv").config();
    if (!process.env.PROXY_SPKI_FINGERPRINT) {
        throw new Error("PROXY_SPKI_FINGERPRINT is not defined in environment.");
    }

    const fs = require("fs");
    const fsPromises = fs.promises;
    const pptr = require("puppeteer");
    var { EventEmitter} = require('events')


    async function launchPuppetteer() {
        return await pptr.launch({
            args: [
                "--proxy-server=https://127.0.0.1:8000",
                "--ignore-certificate-errors-spki-list=" + process.env.PROXY_SPKI_FINGERPRINT,
                "--disable-web-security",
            ],
            // headless: false,
        });
    }

    class AsyncQueue extends EventEmitter {
        limit = 2
        enqueued = []
        running = 0
        constructor(limit) {
            super()
            this.limit =limit
        }

        isEmpty() {
            return this.enqueued.length === 0
        }

        // make sure to only pass 'async' function for this queue
        enqueue(fn) {
            // add to queue
            this.enqueued.push(fn)

            this.next()
        }
        // if a job is done try starting a new one!
        done() {
            this.running--
            console.log('job done! remaining:', this.limit - this.running)
            this.next()
        }

        async next() {

            if(this.isEmpty()) {
                this.emit('empty')
                return
            }
            if (this.running >= this.limit) {
                console.log('queue full')
                return
            }

            this.running++
            console.log('running job!remaining slots:' , this.limit - this.running)

            const job = this.enqueued.shift()

            try {
                await job()
            } catch(err) {
                console.log('Job failed! ' , err)
                this.emit('error', err)
            }

            this.done()
        }
    }


    // manages browser connections. 
    // creates a pool on startup and allows getting references to 
    // the browsers!

    class BroswerPool {
        browsers = []

        async get() {

            // return browser if there is one!

            if(this.browsers.length > 0) {
                return this.browsers.splice(0, 1)[1]
            }

            // no browser available anymore.. 
            // launch a new one!

            return await launchPuppetteer()
        }

        // used for putting a browser back in pool!.

        handback(broswer) {
            this.browsers.push(broswer)
        }

        // shuts down all browsers!.

        async shutDown() {
            for(let broswer of this.browsers) {
                await broswer.close()
            }
        }
    }


    const sites = (await fsPromises.readFile(process.argv[2]))
        .toString()
        .split("\n")
        .map(line => line.split(",")[1])
        .filter(s => s);

    // create browserpool

    const pool = new BroswerPool()

    // create queue
    const limit = 2
    const queue = new AsyncQueue(limit)

    // listen to errors:
    queue.on ('error', err => {
        console.error('error in the queue detected!' , err)
    })

    // enqueue your jobs
    for(let i of sites) {
        const site_no = sites[i];
        console.log(`[${i}] ${site_no}`);

        /// enqueue an async function which takes a broswer from pool

        queue.enqueue(async() => {
            try {
                // get thr browser and crawl a page
                const broswer =await pool.get()
                const result = await crawl(browser, site)
                await fsPromises.appendFile("data1.txt", JSON.stringify(result) + "\n");
                await fsPromises.appendFile("data1.txt", JSON.stringify(result) + "\n");

                // return the browser back to pool so other crawlers can use it!
                pool.handback(broswer)
            } catch(err) {
                console.error(err)
            }
        })
    }

    //helper for waiting for the queue!
    const waitForQueue = async () => {

        if(queue.isEmpty) return Promise.resolve()
        return new Promise((res, rej) => {
            queue.once('empty', res)
        })
    }

    await waitForQueue()

    // In the very end, shut down all broswer:
    await pool.shutDown()

    console.log('done!')

 

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
