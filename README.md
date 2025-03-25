# Discord Weight Bot

A Discord bot that records user weights in a Google Sheet. This bot is deployed on Google Cloud Run and uses the Google Sheets API to store data.

## Features

- Record user weights with a simple command.
- Store data in a Google Sheet.
- Deployed on Google Cloud Run for scalability.

## Prerequisites

- Node.js and npm installed.
- Google Cloud SDK installed.
- A Google Cloud project with the Sheets API enabled.
- A Discord bot token.

## Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/discord-weight-bot.git
   cd discord-weight-bot
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   Create a `.env` file in the root directory and add your environment variables:

   ```
   DISCORD_TOKEN=your_discord_token
   GOOGLE_SHEET_ID=your_google_sheet_id
   ```

4. **Compile TypeScript:**

   ```bash
   npm run build
   ```

5. **Run locally** (optional):

   ```bash
   npm start
   ```

## Deployment

1. **Build and deploy to Google Cloud Run:**

   ```bash
   gcloud run deploy discord-weight-bot --source . --region us-central1 --platform managed --allow-unauthenticated
   ```

2. **Set environment variables in Cloud Run:**

   Use the Google Cloud Console or `gcloud` command to set `DISCORD_TOKEN` and `GOOGLE_SHEET_ID`.

## Usage

- **Add user:** `!adduser <column> <header> <username>`
- **Record weight:** `!weight <weight>`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
