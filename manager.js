/** @param {NS} ns **/
export async function main(ns) {
    const runAutoHack = ns.args[0] || true;
    const runAutoBuyServerAndUpgrade = ns.args[1] || false;
    const buyHackNodeAndUpgrade = ns.args[2] || false;

    ns.tprint(`Running script with autoHack ${runAutoHack ? "enabled" : "disabled"}, autoServer ${runAutoBuyServerAndUpgrade ? "enabled" : "disabled"} and autoNode ${buyHackNodeAndUpgrade ? "enabled" : "disabled"}`)

    ns.disableLog("ALL");

    const workerScript = "early-hack-template.js";
    const basePservRam = 8;
    const redeployEveryMs = 60_000;
    const maxServerRam = ns.getPurchasedServerMaxRam();
    const baseServerName = "pserv";

    const programs = [
        ["BruteSSH.exe", 500_000],
        ["FTPCrack.exe", 1_500_000],
        ["relaySMTP.exe", 5_000_000],
        ["HTTPWorm.exe", 30_000_000],
        ["SQLInject.exe", 250_000_000]
    ];

    let runningServers = new Set();
    let currentTarget = "n00dles";

    // ---------- helpers ----------
    function scanAll(ns) {
        const seen = new Set();
        const stack = ["home"];
        while (stack.length) {
            const host = stack.pop();
            if (seen.has(host)) continue;
            seen.add(host);
            for (const next of ns.scan(host)) {
                if (!seen.has(next)) stack.push(next);
            }
        }
        return [...seen].filter(h => h !== "home" && h !== "darkweb");
    }

    function ownedCrackers(ns) {
        return {
            BruteSSH: ns.fileExists("BruteSSH.exe", "home"),
            FTPCrack: ns.fileExists("FTPCrack.exe", "home"),
            relaySMTP: ns.fileExists("relaySMTP.exe", "home"),
            HTTPWorm: ns.fileExists("HTTPWorm.exe", "home"),
            SQLInject: ns.fileExists("SQLInject.exe", "home")
        };
    }

    function countCrackers(c) {
        return (c.BruteSSH?1:0)+(c.FTPCrack?1:0)+(c.relaySMTP?1:0)+(c.HTTPWorm?1:0)+(c.SQLInject?1:0);
    }

    function openAll(ns, host, c) {
        try { if (c.BruteSSH)  ns.brutessh(host); } catch {}
        try { if (c.FTPCrack)  ns.ftpcrack(host); } catch {}
        try { if (c.relaySMTP) ns.relaysmtp(host);} catch {}
        try { if (c.HTTPWorm)  ns.httpworm(host); } catch {}
        try { if (c.SQLInject) ns.sqlinject(host);} catch {}
    }

    function threadsFor(ns, host, script) {
        const max = ns.getServerMaxRam(host);
        const used = ns.getServerUsedRam(host);
        const free = Math.max(0, max - used);
        const sram = ns.getScriptRam(script, host);
        return sram ? Math.floor(free / sram) : 0;
    }

    function bestTarget(ns, hosts) {
        let best = null, bestScore = -1;
        const myH = ns.getHackingLevel();
        for (const h of hosts) {
            if (!ns.hasRootAccess(h)) continue;
            const req = ns.getServerRequiredHackingLevel(h);
            if (req > myH || req > myH / 2) continue;
            const maxMoney = ns.getServerMaxMoney(h) || 0;
            const minSec   = ns.getServerMinSecurityLevel(h) || 1;
            const growRate = ns.getServerGrowth(h) || 1;
            const score = maxMoney * (growRate / Math.max(1, minSec));
            if (score > bestScore) {
                bestScore = score;
                best = h;
            }
        }
        return best ?? "n00dles";
    }

    async function deploy(ns, host, target) {
        if (!ns.fileExists(workerScript, host)) {
            await ns.scp(workerScript, host);
        }
        const t = threadsFor(ns, host, workerScript);
        if (t > 0) {
            ns.exec(workerScript, host, t, String(target), String(host)); // PASS as string
            runningServers.add(host);
            return true;
        }
        return false;
    }

    // ---------- main loop ----------
    while (true) {
        let money = ns.getServerMoneyAvailable("home");

        // --- Buy TOR Router ---
        if (!ns.hasTorRouter() && money >= 200_000) {
            if (ns.purchaseTor()) ns.tprint("✅ Purchased TOR router!");
        }

        /** --- Buy Programs ---
        for (const [prog, cost] of programs) {
            if (!ns.fileExists(prog, "home") && ns.hasTorRouter() && money >= cost) {
                if (ns.purchaseProgram(prog)) ns.tprint(`✅ Purchased ${prog}`);
                money = ns.getServerMoneyAvailable("home");
            }
        }*/

        // --- Scan network ---
        const allHosts = scanAll(ns);

        if (runAutoHack){
            // --- Root accessible servers ---
            const crackers = ownedCrackers(ns);
            const havePorts = countCrackers(crackers);
            for (const h of allHosts) {
                if (!ns.hasRootAccess(h) && ns.getServerNumPortsRequired(h) <= havePorts) {
                    openAll(ns, h, crackers);
                    ns.nuke(h);
                    ns.tprint(`🔓 Rooted ${h}`);
                }
            }

            // --- Update target to richest hackable server ---
            const hackable = allHosts.filter(s => ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel()/2);
            if (hackable.length > 0) {
                hackable.sort((a,b)=>ns.getServerMaxMoney(b)-ns.getServerMaxMoney(a));
                if (hackable[0] !== currentTarget) {
                    currentTarget = hackable[0];
                    ns.tprint(`🎯 Switching target to ${currentTarget}`);
                    // restart scripts on all running servers
                    for (const h of [...runningServers]) {
                        ns.killall(h);
                        await deploy(ns, h, currentTarget);
                    }
                }
            }

            // --- Deploy to rooted servers ---
            for (const h of allHosts) {
                if (!ns.hasRootAccess(h) || runningServers.has(h) || ns.getServerMaxRam(h) <= 0) continue;
                await deploy(ns, h, currentTarget);
            }
        }

        if (runAutoBuyServerAndUpgrade){
            // --- Buy or upgrade purchased servers ---
            const purchased = ns.getPurchasedServers();
            if (purchased.length < ns.getPurchasedServerLimit()) {
                let ram = basePservRam;
                while (ram*2 <= maxServerRam && money >= ns.getPurchasedServerCost(ram*2)) pass;
                if (money >= ns.getPurchasedServerCost(ram)) {
                    const name = baseServerName;
                    const host = ns.purchaseServer(name, ram);
                    await deploy(ns, host, currentTarget);
                    ns.tprint(`💻 Purchased ${host} (${ram}GB)`);
                }
            } else {
                for (let host of purchased) {
                    const ram = ns.getServerMaxRam(host);
                    const newRam = ram*2;
                    if (newRam <= maxServerRam && money >= ns.getPurchasedServerCost(newRam)) {
                        ns.killall(host);
                        ns.deleteServer(host);
                        const newHost = ns.purchaseServer(host, newRam);
                        await deploy(ns, newHost, currentTarget);
                        ns.tprint(`⬆️ Upgraded ${host} to ${newRam}GB`);
                        break;
                    }
                }
            }
        }

        // --- Buy or upgrade Hacknet Nodes ---
        if(buyHackNodeAndUpgrade){
            // Try to buy a new Hacknet Node if possible
            let nodeCost = ns.hacknet.getPurchaseNodeCost();

            if(ns.fileExists("Formulas.exe")){
                // Track the best upgrade option found so far
                let bestChoice = {
                    cost: Infinity, // Cost of the upgrade
                    roi: Infinity,  // Return on investment (seconds to break even)
                    action: null,   // What kind of upgrade ("buyNode", "level", "ram", "core")
                    node: null      // Which node to upgrade (if applicable)
                };

                let numNodes = ns.hacknet.numNodes();

                // ─────────────────────────────────────────────
                // 1. Check buying a new Hacknet Node
                // ─────────────────────────────────────────────
                let nodeCost = ns.hacknet.getPurchaseNodeCost();
                // Estimate gain: use production of first node as a baseline (or 1 if none exist)
                let nodeGain = (numNodes > 0) ? ns.hacknet.getNodeStats(0).production : 1;
                let nodeROI = nodeGain > 0 ? nodeCost / nodeGain : Infinity; // ROI = cost ÷ gain

                if (nodeCost < bestChoice.cost && nodeROI < bestChoice.roi) {
                    bestChoice = { cost: nodeCost, roi: nodeROI, action: "buyNode" };
                }

                // ─────────────────────────────────────────────
                // 2. Check upgrades for each existing node
                // ─────────────────────────────────────────────
                for (let i = 0; i < numNodes; i++) {
                    let stats = ns.hacknet.getNodeStats(i);

                    // Use formulas API to get exact money/sec production changes
                    let mult = ns.getPlayer().hacknet_node_money_mult;

                    // ── Level Upgrade ──
                    let levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
                    let levelGain = ns.formulas.hacknetNodes.moneyGainRate(stats.level + 1, stats.ram, stats.cores, mult)
                                - ns.formulas.hacknetNodes.moneyGainRate(stats.level, stats.ram, stats.cores, mult);
                    let levelROI = levelGain > 0 ? levelCost / levelGain : Infinity;

                    if (levelCost < bestChoice.cost && levelROI < bestChoice.roi) {
                        bestChoice = { cost: levelCost, roi: levelROI, action: "level", node: i };
                    }

                    // ── RAM Upgrade ──
                    let ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
                    let ramGain = ns.formulas.hacknetNodes.moneyGainRate(stats.level, stats.ram * 2, stats.cores, mult)
                                - ns.formulas.hacknetNodes.moneyGainRate(stats.level, stats.ram, stats.cores, mult);
                    let ramROI = ramGain > 0 ? ramCost / ramGain : Infinity;

                    if (ramCost < bestChoice.cost && ramROI < bestChoice.roi) {
                        bestChoice = { cost: ramCost, roi: ramROI, action: "ram", node: i };
                    }

                    // ── Core Upgrade ──
                    let coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);
                    let coreGain = ns.formulas.hacknetNodes.moneyGainRate(stats.level, stats.ram, stats.cores + 1, mult)
                                - ns.formulas.hacknetNodes.moneyGainRate(stats.level, stats.ram, stats.cores, mult);
                    let coreROI = coreGain > 0 ? coreCost / coreGain : Infinity;

                    if (coreCost < bestChoice.cost && coreROI < bestChoice.roi) {
                        bestChoice = { cost: coreCost, roi: coreROI, action: "core", node: i };
                    }
                }

                // ─────────────────────────────────────────────
                // 3. Buy the best option if affordable
                // ─────────────────────────────────────────────
                if (money >= bestChoice.cost && bestChoice.cost !== Infinity) {
                    if (bestChoice.action === "buyNode") {
                        let id = ns.hacknet.purchaseNode();
                        ns.tprint(`✅ Bought Hacknet Node #${id} | Cost: \$${ns.formatNumber(bestChoice.cost)} | ROI: ${bestChoice.roi.toFixed(2)}s`);
                    }
                    else if (bestChoice.action === "level") {
                        ns.hacknet.upgradeLevel(bestChoice.node, 1);
                        ns.tprint(`⬆️ Upgraded Node #${bestChoice.node} Level | Cost: \$${ns.formatNumber(bestChoice.cost)} | ROI: ${bestChoice.roi.toFixed(2)}s`);
                    }
                    else if (bestChoice.action === "ram") {
                        ns.hacknet.upgradeRam(bestChoice.node, 1);
                        ns.tprint(`💾 Upgraded Node #${bestChoice.node} RAM | Cost: \$${ns.formatNumber(bestChoice.cost)} | ROI: ${bestChoice.roi.toFixed(2)}s`);
                    }
                    else if (bestChoice.action === "core") {
                        ns.hacknet.upgradeCore(bestChoice.node, 1);
                        ns.tprint(`🧠 Upgraded Node #${bestChoice.node} Core | Cost: \$${ns.formatNumber(bestChoice.cost)} | ROI: ${bestChoice.roi.toFixed(2)}s`);
                    }
                }
            }else{
                if (money > nodeCost) {
                    let nodeIndex = ns.hacknet.purchaseNode();
                    if (nodeIndex !== -1) {
                        ns.tprint(`✅ Bought Hacknet Node #${nodeIndex} for \$${ns.formatNumber(nodeCost)}`);
                    }
                }

                // Upgrade existing nodes
                let myNodes = ns.hacknet.numNodes();
                for (let i = 0; i < myNodes; i++) {
                    // Upgrade level
                    let levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
                    if (money > levelCost) {
                        ns.hacknet.upgradeLevel(i, 1);
                        ns.tprint(`Upgraded HackNode(${i}) Level Cost: ${levelCost}`)
                        money -= levelCost; 
                    }

                    // Upgrade RAM
                    let ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
                    if (money > ramCost) {
                        ns.hacknet.upgradeRam(i, 1);
                        ns.tprint(`Upgrade HackNode(${i}) RAM Cost: ${ramCost}`)
                        money -= ramCost;
                    }

                    // Upgrade cores
                    let coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);
                    if (money > coreCost) {
                        ns.hacknet.upgradeCore(i, 1);
                        ns.tprint(`Upgrade HackNode(${i}) Core Cost: ${coreCost}`)
                        money -= coreCost;
                    }
                }
            }
        }

        await ns.sleep(redeployEveryMs);
    }
}

        await ns.sleep(redeployEveryMs);
    }
}
