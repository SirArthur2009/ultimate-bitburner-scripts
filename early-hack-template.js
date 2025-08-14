/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0] || "n00dles"; // fallback
    const myself = ns.args[1];
    ns.tprint(`🚀 Running hack script on target: ${target} from ${myself}`);

    const moneyThresh = ns.getServerMaxMoney(target) * 0.8;
    const securityThresh = ns.getServerMinSecurityLevel(target) + 5;

    while(true) {
        if (ns.getServerSecurityLevel(target) > securityThresh) {
            await ns.weaken(target);
        } else if (ns.getServerMoneyAvailable(target) < moneyThresh) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}

