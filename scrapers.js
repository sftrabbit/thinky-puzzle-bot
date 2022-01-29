const axios = require('axios')
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
        title: gameInfo['name'].trim(),
        description: gameInfo['short_description']
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

      const descriptionElement = rootElement.querySelector('.formatted_description')
      const description = descriptionElement.text
      const shortDescription = description.split('\n').find((line) => line.length !== 0)

      return {
        title: titleElement.text.trim(),
        description: shortDescription
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

      const descriptionElement = rootElement.querySelector('[data-component="AboutSectionLayout"]')
      const description = descriptionElement.text
      const shortDescription = description.split('\n').find((line) => line.length !== 0)

      return {
        title: titleElement.text.trim(),
        description: shortDescription
      }
    }
  },
  {
    name: 'Link',
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
    return titleElement.text
  }

  const h1Element = rootElement.querySelector('h1')
  if (h1Element != null) {
    return h1Element.text
  }

  return null
}

module.exports = {
  SCRAPERS
}
