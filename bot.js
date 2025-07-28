// load .env file
require("dotenv").config()

// replicate a minecraft client
const mineflayer = require("mineflayer")

// log into microsoft for mineflayer to use
const { Authflow } = require("prismarine-auth")

// log in as discord bot
const { Client, GatewayIntentBits } = require("discord.js")

class StatCheckerBot {
    constructor() {
        this.lastMessageSent = null
        this.discordClient = null
        this.mcBot = null
        this.init()
    }

    async init() {
        await this.initDiscord()
        await this.initMinecraft()
    }

    async initDiscord() {
        // creates discord client
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        })

        this.discordClient.once("ready", () => console.log(`logged in as ${this.discordClient.user.tag}`))

        this.discordClient.on("messageCreate", (message) => {
            // relay message to officer chat if it's in the right channel
            if (message.channel.id === process.env.DISCORD_CHANNEL_ID)
                this.sendMinecraftMessage(`${message.author.username}: ${message.content}`)
        })

        await this.discordClient.login(process.env.DISCORD_TOKEN)
    }

    async initMinecraft() {
        // log in with prismarine
        const authflow = new Authflow(process.env.EMAIL, process.env.CACHE, {
            authTitle: "statchecker",
            deviceType: "Win32",
            flow: "msal",
            password: process.env.PASSWORD
        })

        try {
            // log into hypixel
            const session = await authflow.getMinecraftJavaToken()
            this.mcBot = mineflayer.createBot({
                host: "mc.hypixel.net",
                port: 25565,
                username: session.profile.name,
                auth: "microsoft",
                version: "1.8.9",
            })

            this.mcBot.on("message", (msg) => this.handleMinecraftMessage(msg))
            this.mcBot.on("login", () => console.log("joined"))
            this.mcBot.on("error", err => console.error("error:", err))
            this.mcBot.on("end", () => console.log("disconnected"))
        } catch (err) {
            console.error("auth failed:", err)
        }
    }

    sendMinecraftMessage(msg, ignore = false) {
        // ignore is true for the antispam protocol
        if (!ignore) this.lastMessageSent = msg
        console.log("<<", msg)
        this.mcBot.chat(`/oc ${msg}`)
    }

    handleMinecraftMessage(msg) {
        const text = msg.getText()
        console.log(`>> ${text}`)

        // if text is in officer chat handle commands
        if (text.startsWith("Officer")) {
            let tokens = text.split(" ")
            let nameIndex = 0
            while (!tokens[nameIndex].endsWith(":")) nameIndex++
            const command = tokens[nameIndex + 1]
            switch (command) {
                // statcheck command
                case "sc":
                    if (nameIndex + 2 >= tokens.length) break
                    const name = tokens[nameIndex + 2]
                    this.getMojangUUID(name).then(uuid => {
                        if (!uuid) return
                        this.getBedwarsStats(uuid).then(stats => {
                            if (!stats) return
                            const reply = `${name}: ${stats.stars}✫ | ${stats.finalKills} Finals | ${stats.fkdr} FKDR | ${stats.wins} Wins | ${stats.wlr} WLR`
                            this.sendMinecraftMessage(reply)
                        })
                    })
                    break
            }
        } else if (text.startsWith("You cannot say")) {
            // send a series of messages to prevent spam
            // hypixel allows you to "send a message twice" after a 3 message buffer
            [
                "flagged for spam!",
                ..."ab".split(""),
                this.lastMessageSent
            ].forEach((e, i) => {
                setTimeout(() => this.sendMinecraftMessage(`${e}`, true), 250 * i)
            })
        }
    }

    // fetches mojang api to get uuid of user
    async getMojangUUID(username) {
        try {
            const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`)
            if (!response.ok) return null
            const data = await response.json()
            return data.id
        } catch (err) {
            console.error("fetch error:", err)
            return null
        }
    }

    // fetches hypixel api with uuid to get stats
    async getBedwarsStats(uuid) {
        try {
            const response = await fetch(`https://api.hypixel.net/player?key=${process.env.API_KEY}&uuid=${uuid}`)
            if (!response.ok) return null
            const data = await response.json()
            if (!data.success || !data.player) return null

            const bw = data.player.stats?.Bedwars
            if (!bw) return null

            const stars = Math.floor(bw.Experience / 5000)
            const finalKills = bw.final_kills_bedwars || 0
            const finalDeaths = bw.final_deaths_bedwars || 1
            const fkdr = (finalKills / finalDeaths).toFixed(2)
            const wins = bw.wins_bedwars || 0
            const losses = bw.losses_bedwars || 1
            const wlr = (wins / losses).toFixed(2)

            return { stars, finalKills, fkdr, wins, wlr }
        } catch (err) {
            console.error("hypixel api error:", err)
            return null
        }
    }
}

// start bot
new StatCheckerBot()