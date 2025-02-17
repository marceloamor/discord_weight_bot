// Import necessary Discord.js classes and other dependencies
import { Client, Events, GatewayIntentBits, Message } from 'discord.js';
import * as dotenv from 'dotenv';
import { SheetsService } from './sheets/sheets-service';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { google } from 'googleapis';

// Load environment variables from .env file
dotenv.config();

// Create a new Discord client instance
// GatewayIntentBits specify which events we want our bot to receive
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Necessary for basic server interactions
        GatewayIntentBits.GuildMessages,    // Needed to receive messages
        GatewayIntentBits.MessageContent,    // Required to read message content
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// Initialize sheets service
const sheetsService = new SheetsService();

// Define a type for user mappings
type UserMappings = { [key: string]: string };

// Define the path to the user-mappings.json file
const mappingsPath = path.join(__dirname, 'user-mappings.json');

// Read and parse the JSON file
let userMappings: UserMappings = {};
try {
    const data = fs.readFileSync(mappingsPath, 'utf8');
    userMappings = JSON.parse(data) as UserMappings;
    console.log('User mappings loaded:', userMappings);
} catch (error) {
    console.error('Error reading user-mappings.json:', error);
}

// Function to get the mapped username
function getMappedUsername(username: string): string {
    return userMappings[username] || 'Username not mapped';
}

// Add this type definition
type UserColumns = {
    [key: string]: string;
};

// Event handler for when the bot is ready
client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    // Log which servers (guilds) the bot is in
    console.log(`Bot is in ${readyClient.guilds.cache.size} servers`);
});

// Add constants for validation
const MIN_WEIGHT_LBS = 50;  // Minimum reasonable weight in pounds
const MAX_WEIGHT_LBS = 500; // Maximum reasonable weight in pounds

// Helper function to convert kg to lbs with rounding
function kgToLbs(kg: number): number {
    return Number((kg * 2.20462).toFixed(2));
}

// Helper function to validate weight is within reasonable bounds
function isWeightReasonable(weightLbs: number): boolean {
    return weightLbs >= MIN_WEIGHT_LBS && weightLbs <= MAX_WEIGHT_LBS;
}

// Helper function to parse weight input
function parseWeightInput(input: string): { weightLbs: number; originalUnit: 'kg' | 'lbs' } | null {
    // Remove multiple spaces and trim
    const cleanInput = input.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Match patterns like "70.5", "70.5 kg", "70.5 lbs"
    const match = cleanInput.match(/^(\d+\.?\d*)\s*(kg|lbs)?$/);
    
    if (!match) {
        return null;
    }

    const value = parseFloat(match[1]);
    const unit = match[2] as 'kg' | 'lbs' | undefined;

    if (isNaN(value)) {
        return null;
    }

    // Convert to pounds if needed
    const weightLbs = unit === 'kg' ? kgToLbs(value) : value;
    
    return {
        weightLbs,
        originalUnit: unit || 'lbs' // default to lbs if no unit specified
    };
}

// Helper function to parse weight from message
function parseWeight(content: string): number | null {
    // Match just the number and optional unit
    const match = content.match(/(\d+\.?\d*)\s*(kg|lbs)?/i);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase() || 'lbs';

    if (unit === 'kg') {
        return kgToLbs(value);
    }
    return Number(value.toFixed(2));
}

// Update the message handler
client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    // Check if the message mentions the bot
    const isBotMentioned = message.mentions.users.has(client.user!.id);

    if (isBotMentioned) {
        const username = message.author.username;
        const userColumn = userMappings[username];

        console.log('Processing weight for user:', username);
        console.log('User mappings:', userMappings);
        console.log('Found column:', userColumn);

        // Remove the bot mention and trim whitespace
        const contentWithoutMention = message.content
            .replace(`<@${client.user!.id}>`, '')
            .trim();

        if (!userColumn) {
            await message.reply('Your username is not mapped to a column.');
            return;
        }

        const weight = parseWeight(contentWithoutMention);
        if (!weight) {
            await message.reply('Invalid weight format. Please use: @Weight Bot <number> [kg|lbs]');
            return;
        }

        try {
            await sheetsService.recordWeight({
                weight,
                username: userColumn
            }, userMappings);
            await message.reply(`Weight of ${weight.toFixed(2)} lbs recorded.`);
        } catch (error) {
            console.error('Error recording weight:', error);
            await message.reply('There was an error recording your weight.');
        }
    }

    // Keep the 'bad bot' response
    if (message.content.toLowerCase() === 'bad bot') {
        await message.reply("I'm doing my best 😔");
        return;
    }

    if (message.content.startsWith('!adduser')) {
        const args = message.content.split(' ').slice(1);
        if (args.length !== 3) {
            await message.reply('Usage: !adduser <column> <header> <username>');
            return;
        }

        const [column, header, username] = args;
        userMappings[username] = column;
        
        try {
            fs.writeFileSync(path.join(__dirname, 'user-mappings.json'), 
                JSON.stringify(userMappings, null, 2));
            await message.reply(`Added user: ${header} with username: ${username} in column: ${column}`);
        } catch (error) {
            console.error('Error saving user mappings:', error);
            await message.reply('Error saving user mapping.');
        }
    }
});

// Add these event handlers after the client initialization
client.on('disconnect', () => {
    console.log('Bot disconnected from Discord!');
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

client.on('reconnecting', () => {
    console.log('Bot attempting to reconnect...');
});

client.on('resume', () => {
    console.log('Bot resumed connection!');
});

// Create a simple HTTP server
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Discord bot is running!');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// Modify the login to include auto-reconnect
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Successfully logged in to Discord!');
    })
    .catch(error => {
        console.error('Failed to log in to Discord:', error);
        // Attempt to reconnect
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            client.login(process.env.DISCORD_TOKEN);
        }, 5000); // Wait 5 seconds before trying again
    });

console.log('Bot is starting...');
