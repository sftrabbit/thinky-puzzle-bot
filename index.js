const { Client, Intents } = require('discord.js')

const { SCRAPERS } = require('./scrapers')

const LINK_REACTION_EMOJI = '🔗'
const URL_PATTERN = /(?<url>\<?https?:\/\/[^\s]+)/g

const MAX_PROCESSED_MESSAGES = 100
const processedMessageIds = []

for (const envVariable of ['DISCORD_BOT_TOKEN', 'GAME_LIST_CHANNEL_ID']) {
  if (process.env[envVariable] == null) {
    console.error(`Missing ${envVariable} environment variable`)
    return
  }
}

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
})

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
})

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) {
      await reaction.fetch()
    }

    if (reaction.emoji.name !== LINK_REACTION_EMOJI) {
      return
    }

    const gameListChannelId = process.env.GAME_LIST_CHANNEL_ID

    console.log(`Received link reaction from ${user.username}`)

    if (reaction.count > 1) {
      console.log('Skipping link reaction because it is not the first link reaction on this message')
      return
    }

    const messageId = reaction.message.id

    if (processedMessageIds.includes(messageId)) {
      console.log(`Skipping link reaction because we already processed this message`)
      return
    }

    if (reaction.message.channelId === gameListChannelId) {
      console.log(`Skipping link reaction because it was in game list channel (${gameListChannelId})`)
      return
    }

    if (reaction.message.author.id === client.user.id) {
      console.log(`Skipping link reaction because message author was ${client.user.username}`)
      return
    }

    const games = {};

    const messageContent = reaction.message.content

    const urls = [...messageContent.matchAll(URL_PATTERN)]
      .map((match) => {
        const url = match.groups.url

        if (url.startsWith('<') && url.endsWith('>')) {
          return url.substring(1, url.length - 1)
        }

        return url
      })

    for (const url of urls) {
      for (const scraper of SCRAPERS) {
        const match = url.match(scraper.urlPattern)
        if (match) {
          try {
            const game = await scraper.scrape(match)

            if (game == null) {
              break
            }

            if (games[game.title] == null) {
              games[game.title] = {
                ...game,
                links: []
              }
            }

            games[game.title].links.push({
              name: scraper.name,
              url: url
            })

            break
          } catch (error) {
            console.error(`Failed to scrape with ${scraper.name} scraper: ${error}`)
          }
        }
      }
    }

    const gameTitles = Object.keys(games)
    if (gameTitles.length > 0) {
      const channel = await client.channels.fetch(gameListChannelId)

      for (const gameTitle of gameTitles) {
        const game = games[gameTitle]

        const originalMessageQuote = removeLinkPreviews(quoteMessage(reaction.message))
        const formattedLinks = game.links
          .map((link) => {
            return `${link.name}: ${link.url}`
          }).join('\n')

        channel.send(
          `**${game.title}**\n` +
          `${originalMessageQuote}\n\n` +
          (game.description != null
            ? `${removeLinkPreviews(game.description)}\n\n`
            : ''
          ) +
          formattedLinks
        )
      }

      channel.send(
        `ℹ️ React to links in other channels with the ${LINK_REACTION_EMOJI} emoji to add them to this list`
      )

      processedMessageIds.push(messageId)

      if (processedMessageIds.length > MAX_PROCESSED_MESSAGES) {
        processedMessageIds.shift()
      }
    }
  } catch (error) {
    console.error(`Failed to process link reaction: ${error.message}`)
  }
})

function quoteMessage (message) {
  return `\\@${message.author.username} said (<${message.url}>):\n` +
    message.content.split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
}

function removeLinkPreviews(messageContent) {
  return messageContent
    .replace(URL_PATTERN, (url) => {
      if (url.startsWith('<') && url.endsWith('>')) {
        return url
      }

      return `<${url}>`
    })
}

client.login(process.env.DISCORD_BOT_TOKEN)
