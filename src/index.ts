// Import necessary Discord.js classes and other dependencies
import { Client, Events, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import { SheetsService } from './sheets/sheets-service';
import fs from 'fs';
import path from 'path';

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

// Load user mappings from JSON file
const userMappingsPath = path.join(__dirname, 'user-mappings.json');
let userColumns: { [key: string]: string } = {};

// Function to load user mappings from file
function loadUserMappings() {
    try {
        const data = fs.readFileSync(userMappingsPath, 'utf8');
        userColumns = JSON.parse(data);
        console.log('User mappings loaded:', userColumns);
    } catch (error) {
        console.error('Error loading user mappings:', error);
    }
}

// Function to save user mappings to file
function saveUserMappings() {
    try {
        fs.writeFileSync(userMappingsPath, JSON.stringify(userColumns, null, 2));
        console.log('User mappings saved:', userColumns);
    } catch (error) {
        console.error('Error saving user mappings:', error);
    }
}

// Load mappings at startup
loadUserMappings();

// Event handler for when the bot is ready
client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    // Log which servers (guilds) the bot is in
    console.log(`Bot is in ${readyClient.guilds.cache.size} servers`);
});

// Add constants for validation
const MIN_WEIGHT_LBS = 50;  // Minimum reasonable weight in pounds
const MAX_WEIGHT_LBS = 500; // Maximum reasonable weight in pounds
const LBS_PER_KG = 2.20462; // Conversion factor for kg to lbs

// Helper function to convert kg to lbs
function kgToLbs(kg: number): number {
    return kg * LBS_PER_KG;
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

// Update the message handler
client.on('messageCreate', async (message) => {
    // Log every message the bot can see
    console.log('=== New Message ===');
    console.log('Content:', message.content);
    console.log('Author:', message.author.tag);
    console.log('Channel:', message.channel.id);
    console.log('==================');

    // Ignore messages from bots
    if (message.author.bot) {
        console.log('Ignoring bot message');
        return;
    }

    // Respond to "good bot"
    if (message.content.toLowerCase() === 'good bot') {
        await message.reply('Anytime, love!');
        return;
    }

    // Add user command
    if (message.content.startsWith('!adduser')) {
        const args = message.content.split(' ').slice(1); // Get arguments after the command
        if (args.length !== 3) {
            await message.reply('Usage: !adduser <column> <header> <username>');
            return;
        }

        const [column, header, username] = args;
        userColumns[username] = column;
        saveUserMappings(); // Save to file after updating

        await message.reply(`Added user: ${header} with username: ${username} in column: ${column}`);
        console.log(`Added user: ${header} with username: ${username} in column: ${column}`);
        return;
    }

    if (message.content.startsWith('!weight')) {
        console.log('Received weight command from:', message.author.username);
        console.log('Current user mappings:', userColumns);
        
        // Get everything after !weight command
        const weightInput = message.content.slice('!weight'.length).trim();
        
        try {
            if (!weightInput) {
                await message.reply(
                    'Please provide a weight value. Examples:\n' +
                    '`!weight 155` (assumes lbs)\n' +
                    '`!weight 70.5 kg`\n' +
                    '`!weight 155 lbs`'
                );
                return;
            }

            const parsedWeight = parseWeightInput(weightInput);
            
            if (!parsedWeight) {
                await message.reply(
                    'Invalid weight format. Examples:\n' +
                    '`!weight 155` (assumes lbs)\n' +
                    '`!weight 70.5 kg`\n' +
                    '`!weight 155 lbs`'
                );
                return;
            }

            if (!isWeightReasonable(parsedWeight.weightLbs)) {
                await message.reply(
                    `Weight must be between ${MIN_WEIGHT_LBS} and ${MAX_WEIGHT_LBS} lbs ` +
                    `(${(MIN_WEIGHT_LBS / LBS_PER_KG).toFixed(1)} to ` +
                    `${(MAX_WEIGHT_LBS / LBS_PER_KG).toFixed(1)} kg)`
                );
                return;
            }

            // Use the updated userColumns mapping
            const userColumn = userColumns[message.author.username];
            if (!userColumn) {
                await message.reply('Your username is not mapped to a column. Please contact the admin.');
                console.log('No mapping found for username:', message.author.username);
                return;
            }

            // Record weight in Google Sheets
            await sheetsService.recordWeight({
                weight: parsedWeight.weightLbs,
                username: message.author.username
            }, userColumns);

            // Format response with both units
            const responseMsg = parsedWeight.originalUnit === 'kg' 
                ? `Recorded weight: ${weightInput} (${parsedWeight.weightLbs.toFixed(1)} lbs)`
                : `Recorded weight: ${weightInput} lbs (${(parsedWeight.weightLbs / LBS_PER_KG).toFixed(1)} kg)`;

            await message.reply(responseMsg);
            console.log(`Successfully recorded weight: ${parsedWeight.weightLbs} lbs`);

        } catch (error) {
            console.error('Error handling weight command:', error);
            await message.reply('Sorry, there was an error recording your weight.');
        }
    }
});

// Add error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Login with more detailed error handling
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Successfully logged in to Discord!');
    })
    .catch(error => {
        console.error('Failed to log in to Discord:', error);
        process.exit(1);
    });
