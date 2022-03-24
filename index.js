const { default: { list: extractUrls } } = require('anchorme')
const { Client, Intents } = require('discord.js')
const { Routes } = require('discord-api-types/v9')
const { SlashCommandBuilder } = require('@discordjs/builders')
const { REST } = require('@discordjs/rest')

const { SCRAPERS } = require('./scrapers')

const LINK_REACTION_EMOJI = '🔗'
const PROCESSED_REACTION_EMOJI = '✅'

const MAX_LINKS = 5

const MESSAGE_ID_PATTERN = /^\d+$/
const MESSAGE_PATH_PATTERN = /\/channels\/(?<guildId>\d+)\/(?<channelId>\d+)\/(?<messageId>\d+)\/?$/

for (const envVariable of ['DISCORD_BOT_TOKEN', 'GUILD_ID', 'GAME_LIST_CHANNEL_ID']) {
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

  const guild = await client.guilds.fetch(process.env.GUILD_ID)
  console.log(`Serving guild: ${guild.name}`)
  const discordApi = new REST({ version: '9' })
    .setToken(process.env.DISCORD_BOT_TOKEN)

  const commands = await discordApi.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    {
      body: [
        new SlashCommandBuilder()
          .setName('set-title')
          .setDescription('Set the title of a game link')
          .addStringOption((option) => {
            return option.setName('message-link')
              .setDescription('URL of the game link message to be updated')
              .setRequired(true)
          })
          .addStringOption((option) => {
            return option.setName('new-title')
              .setDescription('New title for this game link')
              .setRequired(true)
          })
          .setDefaultPermission(false)
          .toJSON()
      ]
    }
  )

  const roles = await guild.roles.fetch()
  const moderatorRole = roles.find((role) => role.name === 'Moderators')

  if (moderatorRole != null) {
    const setTitleCommandId = commands.find((command) => command.name === 'set-title').id

    const setTitleCommand = await guild.commands.fetch(setTitleCommandId)
    await setTitleCommand.permissions.add({
      permissions: [
        {
          id: moderatorRole.id,
          type: 'ROLE',
          permission: true
        }
      ]
    })
  } else {
    console.log('No Moderators role - everyone will have permission to use commands')
  }

  console.log(`Registered commands with guild ${process.env.GUILD_ID}`)
})

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isCommand() || interaction.guildId !== process.env.GUILD_ID) {
      return
    }

    if (interaction.commandName !== 'set-title') {
      console.log(`Unknown command ${interaction.commandName}`)
      return
    }

    const gameListChannelId = process.env.GAME_LIST_CHANNEL_ID
    const channel = await client.channels.fetch(gameListChannelId)

    if (interaction.channelId !== process.env.GAME_LIST_CHANNEL_ID) {
      await interaction.reply({
        content: `I can only do this in the #${channel.name} channel`,
        ephemeral: true
      })
      return
    }

    const messageReference = interaction.options.getString('message-link')
    const messageId = parseMessageReference(messageReference)

    const message = await channel.messages.fetch(messageId)

    if (message.author.id !== client.user.id) {
      await interaction.reply({
        content: `That's not one of my messages!`,
        ephemeral: true
      })
      return
    }

    const newTitle =interaction.options.getString('new-title')

    const messageLines = message.content.split('\n')

    if (messageLines.length < 2) {
      throw new Error('Target message doesn\'t have enough lines')
    }

    messageLines[1] = `**${newTitle}**`

    await message.edit(messageLines.join('\n'))

    await interaction.reply({
      content: `I've updated the title to ${newTitle} for you - enjoy!`,
      ephemeral: true
    })
  } catch (error) {
    await interaction.reply({
      content: `Hm, something went wrong: ${error.message}`,
      ephemeral: true
    })
    console.error(`Failed to process interaction: ${error.message}`)
  }
})

function parseMessageReference(messageReference) {
  const messageIdMatch = messageReference.match(MESSAGE_ID_PATTERN)
  if (messageIdMatch != null) {
    return messageReference
  }

  const messagePathMatch = messageReference.match(MESSAGE_PATH_PATTERN)
  if (messagePathMatch != null) {
    return messagePathMatch.groups.messageId
  }

  throw new Error('Your message-link doesn\'t seem to be a valid message URL or ID')
}

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) {
      await reaction.fetch()
    }

    if (reaction.message.guildId !== process.env.GUILD_ID || reaction.emoji.name !== LINK_REACTION_EMOJI) {
      return
    }

    console.log(`Received link reaction from ${user.username}`)

    const gameListChannelId = process.env.GAME_LIST_CHANNEL_ID
    const channel = await client.channels.fetch(gameListChannelId)

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

        return url.protocol != null
          && url.protocol.match(/^https?:\/\/$/)
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
            console.error(`Failed to scrape with ${scraper.name} scraper: ${error.stack}`)
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
    console.error(`Failed to process link reaction: ${error.stack}`)
  }
})

function quoteMessage (message) {
  return `${message.author.username} said:\n` +
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
