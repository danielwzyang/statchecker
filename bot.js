// load env
require("dotenv").config()

const mineflayer = require("mineflayer")
const { Authflow } = require("prismarine-auth")

// msal login with prismarine
const authflow = new Authflow(process.env.EMAIL, process.env.CACHE, {
    authTitle: "statchecker",
    deviceType: "Win32",
    flow: "msal",
    password: process.env.PASSWORD
})

// fetch mojang uuid
async function getMojangUUID(username) {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`)
        if (!response.ok) {
            console.error("failed to fetch uuid")
            return null
        }
        const data = await response.json()
        return data.id
    } catch (err) {
        console.error("fetch error:", err)
        return null
    }
}

// fetch bedwars stats
async function getBedwarsStats(uuid) {
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

async function startBot() {
    try {
        const session = await authflow.getMinecraftJavaToken()

        // log in to hypixel
        const bot = mineflayer.createBot({
            host: "mc.hypixel.net",
            port: 25565,
            username: session.profile.name,
            auth: "microsoft",
            version: "1.8.9",
        })

        // handle chat messages
        bot.on("message", (msg) => {
            const text = msg.getText()

            console.log(`>> ${text}`)

            // officer chat message
            if (text.startsWith("Officer")) {
                let tokens = text.split(" ")
                let nameIndex = 0

                // look for the name of the person who sent the dm
                while (!tokens[nameIndex].endsWith(":"))
                    nameIndex++

                const command = tokens[nameIndex + 1]

                switch (command) {
                    // statcheck
                    case "sc":
                        console.log("processing statcheck...")
                        // no username provided
                        if (nameIndex + 2 >= tokens.length) {
                            console.log("no username provided")
                            break
                        }

                        const name = tokens[nameIndex + 2]

                        console.log("stat checking", name)

                        // get uuid
                        getMojangUUID(name).then(uuid => {
                            if (!uuid) return console.log("couldn't find uuid")

                            console.log("uuid:", uuid)

                            // get stats with uuid
                            getBedwarsStats(uuid).then(stats => {
                                if (!stats) return console.log("stats not found")

                                console.log("stats found")
                                console.log("<<", `/oc ${name}: ${stats.stars}✫ | ${stats.finalKills} Finals | ${stats.fkdr} FKDR | ${stats.wins} Wins | ${stats.wlr} WLR`)
                                bot.chat(`/oc ${name}: ${stats.stars}✫ | ${stats.finalKills} Finals | ${stats.fkdr} FKDR | ${stats.wins} Wins | ${stats.wlr} WLR`)
                            })
                        })

                        break
                }
            }

            // antispam protocol
            else if (text.startsWith("You cannot say")) {
                // send a series of messages
                [
                    "flagged for spam! please try again after the next 3 messages.",
                    ..."abc".split("")
                ].forEach((e, i) => {
                    setTimeout(function () {
                        console.log("<<", `/oc ${e}`)
                        bot.chat(`/oc ${e}`)
                    }, 500 * i)
                })
            }
        })

        bot.on("login", () => {
            console.log("joined")

            // warp to home
            setTimeout(function () {
                console.log("<<", "/home")
                bot.chat("/home")
            }, 2000)
        })

        bot.on("error", err => console.error("error:", err))

        bot.on("end", () => console.log("disconnected"))
    } catch (err) {
        console.error("auth failed:", err)
    }
}

// start bot
startBot()