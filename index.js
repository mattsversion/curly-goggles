const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const config = require('./config.json');

// Use stealth plugin
puppeteer.use(StealthPlugin());

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Roblox Manager Class
class RobloxManager {
    constructor() {
        this.cookies = [];
        this.targetUsername = '';
        this.isRunning = false;
        this.activeBots = new Map();
        this.stats = {
            totalSent: 0,
            totalDeclined: 0,
            totalResent: 0,
            activeAccounts: 0,
            errors: 0
        };
        console.log('🤖 Roblox Manager initialized');
    }

    async loadCookies(filename = 'cookies.txt') {
        try {
            if (!fs.existsSync(filename)) {
                fs.writeFileSync(filename, '# Add your Roblox cookies here\n# One cookie per line\n_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_EXAMPLE_COOKIE_HERE');
                return {
                    success: false,
                    message: `📄 Created ${filename}. Add your cookies and run !load again.`
                };
            }

            const content = fs.readFileSync(filename, 'utf8');
            this.cookies = content.split('\n')
                .filter(line => line.trim().startsWith('_|WARNING'))
                .map(cookie => cookie.trim());

            if (this.cookies.length === 0) {
                return {
                    success: false,
                    message: '❌ No valid cookies found! Make sure each cookie starts with _|WARNING'
                };
            }

            return {
                success: true,
                message: `✅ Loaded ${this.cookies.length} cookies from ${filename}`,
                count: this.cookies.length
            };
        } catch (error) {
            return {
                success: false,
                message: `❌ Error loading cookies: ${error.message}`
            };
        }
    }

    async startRaid(targetUsername, maxBots = 3) {
        if (this.isRunning) {
            return { success: false, message: '❌ Raid already in progress!' };
        }

        if (this.cookies.length === 0) {
            const loaded = await this.loadCookies();
            if (!loaded.success) return loaded;
        }

        this.targetUsername = targetUsername;
        this.isRunning = true;
        this.stats = {
            totalSent: 0,
            totalDeclined: 0,
            totalResent: 0,
            activeAccounts: 0,
            errors: 0
        };

        console.log(`🎯 Starting raid on: ${targetUsername}`);

        // Start bots
        const botsToStart = Math.min(maxBots, this.cookies.length);
        
        for (let i = 0; i < botsToStart; i++) {
            this.startBot(i, this.cookies[i]);
            await this.delay(2000); // Stagger starts
        }

        return {
            success: true,
            message: `✅ Raid started on **${targetUsername}** with ${botsToStart} accounts!\n📊 Stats will update automatically.`,
            stats: this.stats
        };
    }

    async startBot(botId, cookie) {
        console.log(`[Bot ${botId}] Starting...`);
        
        try {
            const browser = await puppeteer.launch({
                headless: config.headless ? 'new' : false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled'
                ],
                ignoreDefaultArgs: ['--disable-extensions']
            });

            const page = await browser.newPage();
            
            // Random viewport
            await page.setViewport({
                width: 1920 - Math.floor(Math.random() * 300),
                height: 1080 - Math.floor(Math.random() * 200),
                deviceScaleFactor: 1,
                hasTouch: false,
                isLandscape: true
            });

            // Random user agent
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ];
            await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);

            // Stealth mode
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            });

            // Store bot
            this.activeBots.set(botId, {
                browser,
                page,
                cookie,
                isActive: true,
                lastAction: Date.now()
            });

            this.stats.activeAccounts++;
            
            // Start bot loop
            this.botLoop(botId);

            console.log(`[Bot ${botId}] Started successfully`);

        } catch (error) {
            console.error(`[Bot ${botId}] Failed to start:`, error.message);
            this.stats.errors++;
        }
    }

    async botLoop(botId) {
        const bot = this.activeBots.get(botId);
        if (!bot || !bot.isActive || !this.isRunning) return;

        try {
            // Login with cookie
            const loggedIn = await this.loginWithCookie(bot.page, bot.cookie);
            
            if (!loggedIn) {
                console.log(`[Bot ${botId}] Login failed`);
                this.restartBot(botId);
                return;
            }

            console.log(`[Bot ${botId}] Logged in successfully`);

            // Main loop
            while (bot.isActive && this.isRunning) {
                try {
                    // Send friend request
                    const result = await this.sendFriendRequest(bot.page, this.targetUsername);
                    
                    if (result.success) {
                        this.stats.totalSent++;
                        console.log(`[Bot ${botId}] Sent friend request to ${this.targetUsername}`);
                        
                        // Wait and check if declined
                        await this.delay(10000);
                        
                        const status = await this.checkRequestStatus(bot.page, this.targetUsername);
                        if (status === 'declined') {
                            this.stats.totalDeclined++;
                            console.log(`[Bot ${botId}] Request was declined, will resend later`);
                        }
                    }

                    // Random delay between 30-60 seconds
                    await this.delay(30000 + Math.random() * 30000);

                } catch (error) {
                    console.error(`[Bot ${botId}] Loop error:`, error.message);
                    this.stats.errors++;
                    
                    // Wait longer on error
                    await this.delay(60000);
                }
            }

        } catch (error) {
            console.error(`[Bot ${botId}] Fatal error:`, error.message);
            this.restartBot(botId);
        }
    }

    async loginWithCookie(page, cookie) {
        try {
            await page.goto('https://roblox.com', { waitUntil: 'networkidle2', timeout: 30000 });
            await this.delay(2000);

            // Set cookie
            await page.setCookie({
                name: '.ROBLOSECURITY',
                value: cookie,
                domain: '.roblox.com',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'None'
            });

            // Refresh to login
            await page.goto('https://www.roblox.com/home', { waitUntil: 'networkidle2', timeout: 30000 });
            await this.delay(3000);

            // Check if logged in
            const loggedIn = await page.evaluate(() => {
                return !!document.querySelector('[data-testid="avatar-image"], a[href^="/users/"]');
            });

            return loggedIn;

        } catch (error) {
            console.error('Login error:', error.message);
            return false;
        }
    }

    async sendFriendRequest(page, username) {
        try {
            // Go to profile
            await page.goto(`https://www.roblox.com/users/profile?username=${encodeURIComponent(username)}`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await this.delay(3000);

            // Try to find and click friend button
            const friendAdded = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const friendBtn = buttons.find(btn => 
                    btn.textContent.includes('Add Friend') && 
                    !btn.disabled &&
                    !btn.textContent.includes('Pending') &&
                    !btn.textContent.includes('Friends')
                );
                
                if (friendBtn) {
                    friendBtn.click();
                    return true;
                }
                return false;
            });

            if (friendAdded) {
                await this.delay(2000);
                
                // Check if request was sent
                const requestSent = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return buttons.some(btn => 
                        btn.textContent.includes('Pending') ||
                        btn.textContent.includes('Request Sent')
                    );
                });

                return { success: requestSent, declined: false };
            }

            return { success: false, declined: false };

        } catch (error) {
            console.error('Friend request error:', error.message);
            return { success: false, declined: false };
        }
    }

    async checkRequestStatus(page, username) {
        try {
            await page.goto('https://www.roblox.com/my/friends#!/friends', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await this.delay(3000);

            const status = await page.evaluate((targetUser) => {
                // Look for "Add Friend" button which appears when declined
                const elements = document.querySelectorAll('*');
                for (let el of elements) {
                    if (el.textContent && el.textContent.includes(targetUser)) {
                        const parent = el.closest('div, tr, li');
                        if (parent && parent.textContent.includes('Add Friend')) {
                            return 'declined';
                        }
                    }
                }
                return 'pending';
            }, username);

            return status;

        } catch (error) {
            console.error('Check status error:', error.message);
            return 'unknown';
        }
    }

    async stopRaid() {
        this.isRunning = false;
        
        // Close all browsers
        for (const [botId, bot] of this.activeBots) {
            bot.isActive = false;
            try {
                await bot.browser.close();
            } catch (error) {
                console.error(`[Bot ${botId}] Error closing:`, error.message);
            }
        }

        this.activeBots.clear();
        this.stats.activeAccounts = 0;

        return {
            success: true,
            message: '🛑 Raid stopped successfully!',
            finalStats: this.stats
        };
    }

    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            target: this.targetUsername,
            totalAccounts: this.cookies.length,
            activeBots: this.activeBots.size
        };
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async restartBot(botId) {
        const bot = this.activeBots.get(botId);
        if (bot) {
            bot.isActive = false;
            try {
                await bot.browser.close();
            } catch (error) {
                // Ignore
            }
            this.activeBots.delete(botId);
            this.stats.activeAccounts--;
        }

        // Restart if raid is still running and we have cookies
        if (this.isRunning && botId < this.cookies.length) {
            await this.delay(5000);
            this.startBot(botId, this.cookies[botId]);
        }
    }
}

// Create manager instance
const manager = new RobloxManager();

// Discord bot events
client.once('ready', () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);
    client.user.setActivity('!help for commands', { type: 'PLAYING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(config.prefix)) return;
    
    // Admin check
    if (!config.adminIds.includes(message.author.id)) {
        return message.reply('❌ You do not have permission to use this bot.');
    }

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'load':
                const file = args[0] || 'cookies.txt';
                const loadResult = await manager.loadCookies(file);
                await message.reply(loadResult.message);
                break;

            case 'start':
                if (!args[0]) {
                    return message.reply('❌ Usage: `!start <roblox_username>`');
                }
                const target = args[0];
                const maxBots = parseInt(args[1]) || config.maxConcurrentBots;
                
                const startResult = await manager.startRaid(target, maxBots);
                await message.reply(startResult.message);
                break;

            case 'stop':
                const stopResult = await manager.stopRaid();
                
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🛑 Raid Stopped')
                    .addFields(
                        { name: 'Total Sent', value: stopResult.finalStats.totalSent.toString(), inline: true },
                        { name: 'Total Declined', value: stopResult.finalStats.totalDeclined.toString(), inline: true },
                        { name: 'Total Resent', value: stopResult.finalStats.totalResent.toString(), inline: true },
                        { name: 'Errors', value: stopResult.finalStats.errors.toString(), inline: true }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                break;

            case 'stats':
                const stats = manager.getStats();
                
                const statsEmbed = new EmbedBuilder()
                    .setColor(stats.isRunning ? 0x00FF00 : 0xFFA500)
                    .setTitle('📊 Raid Statistics')
                    .addFields(
                        { name: 'Status', value: stats.isRunning ? '🟢 Active' : '🔴 Stopped', inline: true },
                        { name: 'Target', value: stats.target || 'None', inline: true },
                        { name: 'Active Bots', value: `${stats.activeBots}/${stats.totalAccounts}`, inline: true },
                        { name: 'Total Sent', value: stats.totalSent.toString(), inline: true },
                        { name: 'Total Declined', value: stats.totalDeclined.toString(), inline: true },
                        { name: 'Total Resent', value: stats.totalResent.toString(), inline: true },
                        { name: 'Errors', value: stats.errors.toString(), inline: true }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [statsEmbed] });
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('🤖 Roblox Friend Request Bot')
                    .setDescription('Control the bot using these commands:')
                    .addFields(
                        { name: '`!load [file]`', value: 'Load cookies (default: cookies.txt)', inline: false },
                        { name: '`!start <username> [bots]`', value: 'Start raid (1-5 bots recommended)', inline: false },
                        { name: '`!stop`', value: 'Stop all raids', inline: false },
                        { name: '`!stats`', value: 'Show current statistics', inline: false },
                        { name: '`!help`', value: 'Show this message', inline: false }
                    )
                    .setFooter({ text: 'Works on Replit • Use responsibly' });
                
                await message.reply({ embeds: [helpEmbed] });
                break;

            default:
                await message.reply('❌ Unknown command. Use `!help` for commands.');
        }
    } catch (error) {
        console.error('Command error:', error);
        await message.reply(`❌ Error: ${error.message}`);
    }
});

// Login to Discord
client.login(config.discordToken).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});

// Keep alive for Replit
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Roblox Friend Bot is running!\n');
});

server.listen(8080, () => {
    console.log('🌐 HTTP server running on port 8080');
});