const { default: { list: extractUrls } } = require('anchorme')

const messages = require('./allMessages.json')
const { SCRAPERS } = require('./scrapers')

const entries = []

var mostUrls = 0

async function doStuff () {
  for (const message of messages) {
    console.log('Processing message', message.id)
    // const messageLines = message.content.split('\n')
    // const title = messageLines[1].slice(2, -2)

    const urls = extractUrls(message.content)
      .filter((url, index, urls) => {
        const firstIndex = urls.findIndex((otherUrl) => otherUrl.string === url.string)

        return url.protocol
          && url.protocol.match(/^https?:\/\/$/)
          && url.host !== 'discord.com'
          && firstIndex === index
      })

    if (urls.length > 0) {
      var gameDetails = null

      const firstUrl = urls[0]
      for (const scraper of SCRAPERS) {
        const match = firstUrl.string.match(scraper.urlPattern)
        if (match) {
          try {
            const game = await scraper.scrape(match)

            if (game == null) {
              break
            }

            gameDetails = game
            break
          } catch (error) {
          }
        }
      }

      entries.push({
        gameDetails: gameDetails,
        messageId: message.id,
        authorUsername: message.authorUsername,
        urls: urls
      })

      if (urls.length > mostUrls) {
        mostUrls = urls.length
      }
    }
  }

  console.log(JSON.stringify(entries, null, 2))

  // const headerLine = 'Game,MessageId,Submitter,' + [...Array(mostUrls)].map((_, index) => 'Url ' + (index + 1)).join(',')
  // console.log(headerLine)

  // for (const entry of entries) {
  //   var entryLine = `${entry.gameTitle},${entry.messageId},${entry.authorUsername},`
  //   entryLine += [...Array(mostUrls)].map((_, index) => entry.urls[index] ? entry.urls[index].string : '').join(',')
  //   console.log(entryLine)
  // }
}

doStuff()
  .then(() => console.log('done'))
