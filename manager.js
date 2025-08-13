/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const workerScript = "early-hack-template.js";
    const basePservRam = 8;
    const redeployEveryMs = 60_000;
    const maxServerRam = ns.getPurchasedServerMaxRam();
    const baseServerName = "pserv-";

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
            ns.exec(workerScript, host, t, String(target)); // PASS as string
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

        // --- Root accessible servers ---
        const crackers = ownedCrackers(ns);
        const havePorts = countCrackers(crackers);
        for (const h of allHosts) {
            if (!ns.hasRootAccess(h) && ns.getServerNumPortsRequired(h) <= havePorts && ns.getHackingLevel() >= ns.getServerRequiredHackingLevel(h)) {
                openAll(ns, h, crackers);
                ns.nuke(h);
                ns.tprint(`🔓 Rooted ${h}`);
            }
        }

        // --- Update target to richest hackable server ---
        const hackable = allHosts.filter(s => ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0);
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

        // --- Buy or upgrade purchased servers ---
        const purchased = ns.getPurchasedServers();
        if (purchased.length < ns.getPurchasedServerLimit()) {
            let ram = basePservRam;
            while (ram*2 <= maxServerRam && money >= ns.getPurchasedServerCost(ram*2)) ram *= 2;
            if (money >= ns.getPurchasedServerCost(ram)) {
                const name = baseServerName + Date.now();
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

        await ns.sleep(redeployEveryMs);
    }
}
