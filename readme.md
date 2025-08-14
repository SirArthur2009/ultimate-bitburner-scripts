# Ultimate Bitburner Scripts

> This repository contains automation scripts for the [Bitburner](https://danielyxie.github.io/bitburner/) game, designed to streamline early-game hacking, server management, and Hacknet node upgrades.

## Files

- **manager.js**: Main automation script. Features:
  - Roots servers and deploys hacking scripts automatically.
  - Buys and upgrades purchased servers.
  - Buys and upgrades Hacknet nodes (uses formulas if available).
  - Switches hacking targets to maximize profit.
  - Toggles for auto-hack, auto-server, and auto-Hacknet via script arguments.

- **early-hack-template.js**: Worker script deployed to servers. Features:
  - Weakens, grows, or hacks a target server based on its security and money thresholds.
  - Loops actions to maximize hacking efficiency.

## Usage

1. **Copy scripts to your Bitburner environment.**
2. **Run `manager.js` with desired toggles:**
   - `runAutoHack` (default: true)
   - `runAutoBuyServerAndUpgrade` (default: false)
   - `buyHackNodeAndUpgrade` (default: false)

   Example:

   ```JavaScript
   run manager.js true true true
   ```

3. The script will root servers, deploy `early-hack-template.js`, and manage purchased servers and Hacknet nodes automatically.

## How It Works

- The manager script scans the network, roots servers, and deploys worker scripts to hack the best available target.
- Worker scripts maximize profit by weakening, growing, or hacking servers based on their current state.
- Purchased servers and Hacknet nodes are upgraded for optimal growth.

---

Feel free to modify the scripts for your own Bitburner strategies!
