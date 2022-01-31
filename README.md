# Thinky Puzzle Bot

A bot for the [Thinky Puzzle Games Discord server](https://thinkypuzzlegames.com).

## Usage

The Thinky Puzzle Bot listens for 🔗 reactions on messages, attempts to extract any game links from that message, and posts information about that game to a particular channel.

## Deployment

### Managed environment

When a SemVer release tag (`X.Y.Z`) is pushed, a GitHub Actions workflow will automatically build and push a Docker image to `ghcr.io/sftrabbit/thinky-puzzle-bot:<version>`.

Getting this image in the managed environment is currently a manual process. It is being run on a GCP Compute instance in the `thinky-puzzle-bot-production` GCP project. Simply SSH in to that instance, set the [required environment variables](#configuration), and run the following commands:

```sh
docker pull ghcr.io/sftrabbit/thinky-puzzle-bot:<version>
docker run -d --restart on-failure:10 -e GAME_LIST_CHANNEL_ID -e DISCORD_BOT_TOKEN ghcr.io/sftrabbit/thinky-puzzle-bot:<version>
```

### Local environment

1. Set up the required prerequisites:

    - Node.js 16.13.2 or later (install with [nvm](https://github.com/nvm-sh/nvm))

2. Set the [required environment variables](#configuration).

3. Install dependencies:

    ```sh
    npm ci
    ```

4. Start the Discord bot:

    ```sh
    npm start
    ```

## Configuration

The bot is configured with the following environment variables:

- `GAME_LIST_CHANNEL_ID` (*required*) - the Discord channel ID to which game links will be posted.
- `DISCORD_BOT_TOKEN` (*required*) - the Discord bot's secret token, as obtained from the [Discord developer portal](https://discord.com/developers/applications).