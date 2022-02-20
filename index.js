const { default: { list: extractUrls } } = require('anchorme')
const { Client, Intents, MessageCollector } = require('discord.js')

const { SCRAPERS } = require('./scrapers')

const LINK_REACTION_EMOJI = '🔗'
const PROCESSED_REACTION_EMOJI = '✅'

const MAX_LINKS = 5

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

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`)
  const channel = await client.channels.fetch('764163245275086878')

  const entries = []

  let earliestId = null
  while (true) {
    const messages = await channel.messages.fetch({ limit: 100, before: earliestId })
    for (const [id, message] of messages) {
      entries.push({
        id: id,
        content: message.content,
        authorId: message.author.id,
        authorUsername: message.author.username,
        timestamp: message.createdTimestamp
      })
      earliestId = id
    }
    if (messages.size === 0) {
      break
    }
  }

  console.log(JSON.stringify(entries, null, 2))
  // const messageCollector = channel.createMessageCollector()
  // let count = 0
  // messageCollector.on('collect', () => {
  //   console.log('got message')
  //   count++
  // })
  // messageCollector.on('end', () => {
  //   console.log('done collecting', count)
  // })
  // console.log('starting')
})

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) {
      await reaction.fetch()
    }

    if (reaction.emoji.name !== LINK_REACTION_EMOJI) {
      return
    }

    console.log(`Received link reaction from ${user.username}`)

    const gameListChannelId = process.env.GAME_LIST_CHANNEL_ID
    const channel = await client.channels.fetch(gameListChannelId)

    if (reaction.message.guildId !== channel.guildId) {
      console.log('Skipping link reaction because it was in a different server')
      return
    }

    if (reaction.count > 1) {
      console.log('Skipping link reaction because it is not the first link reaction on this message')
      return
    }

    const processedReaction = reaction.message.reactions.cache.get(PROCESSED_REACTION_EMOJI)

    if (processedReaction) {
      const processedReactionUsers = await processedReaction.users.fetch()

      if (processedReactionUsers.has(client.user.id)) {
        console.log(`Skipping link reaction because we already processed this message`)
        return
      }
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

    const urls = extractUrls(messageContent)
      .slice(0, MAX_LINKS)
      .filter((url, index, urls) => {
        const firstIndex = urls.findIndex((otherUrl) => otherUrl.string === url.string)

        return url.protocol.match(/^https?:\/\/$/)
          && firstIndex === index
      })

    for (const url of urls) {
      console.log(`Scraping URL: ${url.string}`)
      for (const scraper of SCRAPERS) {
        const match = url.string.match(scraper.urlPattern)
        if (match) {
          console.log(`Using ${scraper.name} scraper`)
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
              name: scraper.name != null ? scraper.name : url.host,
              url: url.string
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
      for (const gameTitle of gameTitles) {
        const game = games[gameTitle]

        const formattedLinks = game.links
          .map((link, index) => {
            const linkUrl = index === 0 ? link.url : `<${link.url}>`
            return `${link.name}: ${linkUrl}`
          }).join('\n')

        console.log(`Sending message for ${game.title}`)

        channel.send({
          content:
            '\u200b\n' +
            `**${game.title}**\n` +
            `Discussed here: ${reaction.message.url}\n\n` +
            removeLinkPreviews(
              game.description != null
              ? `> ${game.description}\n\n`
              : `${quoteMessage(reaction.message)}\n\n`
            ) +
            `${formattedLinks}`,
          allowedMentions: {
            users: []
          }
        })
      }

      await reaction.message.react(PROCESSED_REACTION_EMOJI)
    }
  } catch (error) {
    console.error(`Failed to process link reaction: ${error.message}`)
  }
})

function quoteMessage (message) {
  return `<@${message.author.id}> said:\n` +
    message.content.split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
}

function removeLinkPreviews(messageContent) {
  let numCharsInserted = 0

  return extractUrls(messageContent)
    .reduce((messageContent, url) => {
      if (url.start > 0) {
        if (
          messageContent.charAt(url.start + numCharsInserted - 1) === '<' &&
          messageContent.charAt(url.end + numCharsInserted) === '>'
        ) {
          return messageContent
        }
      }

      const modifiedMessageContent = insertText(
        insertText(
          messageContent,
          '<',
          url.start + numCharsInserted
        ),
        '>',
        url.end + numCharsInserted + 1
      )

      numCharsInserted += 2

      return modifiedMessageContent
    }, messageContent)
}

function insertText(text, insertionText, position) {
  return text.slice(0, position) + insertionText + text.slice(position)
}

client.login(process.env.DISCORD_BOT_TOKEN)
