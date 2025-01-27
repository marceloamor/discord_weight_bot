"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Import necessary Discord.js classes and other dependencies
const discord_js_1 = require("discord.js");
const dotenv = __importStar(require("dotenv"));
const sheets_service_1 = require("./sheets/sheets-service");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
// Load environment variables from .env file
dotenv.config();
// Create a new Discord client instance
// GatewayIntentBits specify which events we want our bot to receive
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds, // Necessary for basic server interactions
        discord_js_1.GatewayIntentBits.GuildMessages, // Needed to receive messages
        discord_js_1.GatewayIntentBits.MessageContent, // Required to read message content
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildPresences
    ]
});
// Initialize sheets service
const sheetsService = new sheets_service_1.SheetsService();
// Load user mappings from JSON file
const userMappingsPath = path_1.default.join(__dirname, 'user-mappings.json');
let userColumns = {};
// Function to load user mappings from file
function loadUserMappings() {
    try {
        const data = fs_1.default.readFileSync(userMappingsPath, 'utf8');
        userColumns = JSON.parse(data);
        console.log('User mappings loaded.');
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Error loading user mappings:', error.message);
        }
        else {
            console.error('Unknown error loading user mappings:', error);
        }
    }
}
// Function to save user mappings to file
function saveUserMappings() {
    try {
        fs_1.default.writeFileSync(userMappingsPath, JSON.stringify(userColumns, null, 2));
        console.log('User mappings saved.');
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Error saving user mappings:', error.message);
        }
        else {
            console.error('Unknown error saving user mappings:', error);
        }
    }
}
// Load mappings at startup
loadUserMappings();
// Event handler for when the bot is ready
client.once(discord_js_1.Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    // Log which servers (guilds) the bot is in
    console.log(`Bot is in ${readyClient.guilds.cache.size} servers`);
});
// Add constants for validation
const MIN_WEIGHT_LBS = 50; // Minimum reasonable weight in pounds
const MAX_WEIGHT_LBS = 500; // Maximum reasonable weight in pounds
const LBS_PER_KG = 2.20462; // Conversion factor for kg to lbs
// Helper function to convert kg to lbs
function kgToLbs(kg) {
    return kg * LBS_PER_KG;
}
// Helper function to validate weight is within reasonable bounds
function isWeightReasonable(weightLbs) {
    return weightLbs >= MIN_WEIGHT_LBS && weightLbs <= MAX_WEIGHT_LBS;
}
// Helper function to parse weight input
function parseWeightInput(input) {
    // Remove multiple spaces and trim
    const cleanInput = input.toLowerCase().replace(/\s+/g, ' ').trim();
    // Match patterns like "70.5", "70.5 kg", "70.5 lbs"
    const match = cleanInput.match(/^(\d+\.?\d*)\s*(kg|lbs)?$/);
    if (!match) {
        return null;
    }
    const value = parseFloat(match[1]);
    const unit = match[2];
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
client.on('messageCreate', (message) => __awaiter(void 0, void 0, void 0, function* () {
    if (message.author.bot)
        return;
    if (message.content.toLowerCase() === 'good bot') {
        yield message.reply('Thank you! 😊');
        return;
    }
    if (message.content.startsWith('!adduser')) {
        const args = message.content.split(' ').slice(1);
        if (args.length !== 3) {
            yield message.reply('Usage: !adduser <column> <header> <username>');
            return;
        }
        const [column, header, username] = args;
        userColumns[username] = column;
        saveUserMappings();
        yield message.reply(`Added user: ${header} with username: ${username} in column: ${column}`);
        console.log(`User added: ${header} (${username}) in column ${column}.`);
        return;
    }
    if (message.content.startsWith('!weight')) {
        const userColumn = userColumns[message.author.username];
        if (!userColumn) {
            yield message.reply('Your username is not mapped to a column. Please contact the admin.');
            console.log(`No mapping found for username: ${message.author.username}`);
            return;
        }
        // Assuming parsedWeight is defined somewhere in your code
        const parsedWeight = { weightLbs: 150 }; // Example placeholder
        // Record weight in Google Sheets
        yield sheetsService.recordWeight({
            weight: parsedWeight.weightLbs,
            username: message.author.username
        }, userColumns);
    }
}));
// Add error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});
// Create a simple HTTP server
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => {
    res.send('Discord bot is running!');
});
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
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
