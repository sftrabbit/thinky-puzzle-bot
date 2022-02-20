const axios = require('axios')
const { decode: decodeEscapedHtml } = require('he')
const { parse } = require('node-html-parser')

const SCRAPERS = [
  {
    name: 'Steam',
    urlPattern: /^https?:\/\/store\.steampowered\.com\/app\/(?<appId>[^\s\/]+)/,
    scrape: async (match) => {
      const steamAppId = match.groups.appId
      const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}`)
      const gameInfo = response.data[steamAppId].data

      return {
        title: decodeEscapedHtml(gameInfo['name']).trim(),
        description: decodeEscapedHtml(gameInfo['short_description']),
        developers: gameInfo['developers'],
        publishers: gameInfo['publishers'],
        releaseDate: gameInfo['release_date']['date']
      }
    }
  },
  {
    name: 'itch.io',
    urlPattern: /^https?:\/\/[^\s\/]+\.itch\.io\/[^\s]+/,
    scrape: async (match) => {
      const response = await axios.get(match.input)
      const contentHtml = response.data

      const rootElement = parse(contentHtml)

      const titleElement = rootElement.querySelector('.game_title')
      const title = getFirstLine(decodeEscapedHtml(titleElement.structuredText)).trim()

      const descriptionElement = rootElement.querySelector('.formatted_description')
      const description = decodeEscapedHtml(descriptionElement.structuredText)
      const shortDescription = getFirstLine(description)

      const developers = []
      let releaseDate = null

      const allTableCells = rootElement.querySelectorAll('table tbody tr td')
      for (const tableCell of allTableCells) {
        if (tableCell.rawText.startsWith('Author')) {
          const authorsCell = tableCell.parentNode.childNodes[1]
          const authorElements = authorsCell.querySelectorAll('a')
          for (const authorElement of authorElements) {
            developers.push({
              name: authorElement.text,
              url: authorElement.getAttribute('href')
            })
          }
        }
        if (tableCell.rawText === 'Published') {
          const publishedCell = tableCell.parentNode.childNodes[1]
          const publishedElement = publishedCell.querySelector('abbr')
          releaseDate = publishedElement.getAttribute('title')
        }
      }

      return {
        title: title,
        description: description,
        developers: developers,
        releaseDate: releaseDate
      }
    }
  },
  {
    name: 'Epic',
    urlPattern: /^https?:\/\/www\.epicgames\.com\/store\/[^\s]+/,
    scrape: async (match) => {
      const response = await axios.get(match.input)
      const contentHtml = response.data

      const rootElement = parse(contentHtml)

      const titleElement = rootElement.querySelector('[data-component="TitleSectionLayout"] [data-component="PDPTitleHeader"]')
      const title = getFirstLine(decodeEscapedHtml(titleElement.structuredText)).trim()

      const descriptionElement = rootElement.querySelector('[data-component="AboutSectionLayout"]')
      const description = decodeEscapedHtml(descriptionElement.structuredText)
      const shortDescription = description.split('\n').find((line) => line.length !== 0)

      return {
        title: title,
        description: description
      }
    }
  },
  {
    urlPattern: /.*/,
    scrape: async (match) => {
      const response = await axios.get(match.input)
      const contentHtml = response.data

      const rootElement = parse(contentHtml)

      const title = findGameTitle(rootElement)

      if (title == null) {
        return null
      }

      return {
        title: title.trim()
      }
    }
  }
]

function findGameTitle (rootElement) {
  const titleElement = rootElement.querySelector('title')
  if (titleElement != null) {
    return getFirstLine(decodeEscapedHtml(titleElement.structuredText))
  }

  const h1Element = rootElement.querySelector('h1')
  if (h1Element != null) {
    return getFirstLine(decodeEscapedHtml(h1Element.structuredText))
  }

  return null
}

function getFirstLine (text) {
  return text
    .split('\n')
    .find((line) => line.length !== 0)
}

// SCRAPERS[1].scrape({ input: 'https://notaninart.itch.io/pushing-u' })
//   .then((result) => {
//     console.log(result)
//   })

module.exports = {
  SCRAPERS
}
