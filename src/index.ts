// Import necessary Discord.js classes and other dependencies
import { Client, Events, GatewayIntentBits, Message, GuildMember } from 'discord.js';
import * as dotenv from 'dotenv';
import { SheetsService } from './sheets/sheets-service';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { google } from 'googleapis';
import { DateTime } from 'luxon';  // Add this package for timezone handling

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

// Update the parseWeight function
function parseWeight(content: string): number | null {
    // For @Weight Bot mentions, just look for the number and optional unit
    const match = content.match(/(\d+\.?\d*)\s*(kg|lbs)?/i);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'lbs').toLowerCase();

    if (unit === 'kg') {
        return kgToLbs(value);
    }
    return Number(value.toFixed(2));
}

interface UserData {
    column: string;
    timezone: string;
    reminders: Reminder[];
}

interface Reminder {
    id: string;
    time: string;  // HH:mm format
    days: string[];
}

interface UserStore {
    users: {
        [key: string]: UserData;
    }
}

// Load user data
const dataPath = path.join(__dirname, 'user-data.json');
let userData: UserStore;

try {
    const data = fs.readFileSync(dataPath, 'utf8');
    userData = JSON.parse(data);
    console.log('User data loaded:', userData);
} catch (error) {
    console.error('Error reading user-data.json:', error);
    userData = { users: {} };
}

// Save user data helper
function saveUserData() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(userData, null, 2));
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Add these interfaces at the top with your other interfaces
interface ScheduledReminder {
    username: string;
    reminder: Reminder;
    nextTrigger: Date;
}

// Add these as global variables
let scheduledReminders: ScheduledReminder[] = [];

// Add these helper functions
function scheduleNextReminders() {
    scheduledReminders = [];
    const now = DateTime.now();

    Object.entries(userData.users).forEach(([username, user]) => {
        // Skip users without timezone or reminders
        if (!user.timezone || !user.reminders) {
            console.log(`Skipping user ${username}: missing timezone or reminders`);
            return;
        }

        user.reminders.forEach(reminder => {
            try {
                // Calculate next occurrence
                const userTime = now.setZone(user.timezone);
                const [hours, minutes] = reminder.time.split(':').map(Number);
                
                // Validate time parts
                if (isNaN(hours) || isNaN(minutes)) {
                    console.error(`Invalid time format for user ${username}: ${reminder.time}`);
                    return;
                }

                let nextTrigger = userTime.set({ hour: hours, minute: minutes });
                
                // If the time has passed today, schedule for next valid day
                if (nextTrigger < now) {
                    nextTrigger = nextTrigger.plus({ days: 1 });
                }

                // Get the weekday name and ensure it's not null
                const weekday = nextTrigger.weekdayLong;
                if (!weekday) {
                    console.error(`Could not determine weekday for ${username}`);
                    return;
                }

                // Only schedule if it's on one of the specified days
                if (reminder.days.includes(weekday)) {
                    scheduledReminders.push({
                        username,
                        reminder,
                        nextTrigger: nextTrigger.toJSDate()
                    });
                    console.log(`Scheduled reminder for ${username} at ${nextTrigger.toISO()}`);
                }
            } catch (error) {
                console.error(`Error scheduling reminder for ${username}:`, error);
            }
        });
    });

    // Sort by next trigger time
    scheduledReminders.sort((a, b) => a.nextTrigger.getTime() - b.nextTrigger.getTime());
    
    console.log('Scheduled reminders:', scheduledReminders.map(r => ({
        username: r.username,
        time: r.reminder.time,
        nextTrigger: r.nextTrigger
    })));
}

async function sendReminder(username: string, reminder: Reminder) {
    const guild = client.guilds.cache.first();
    if (guild) {
        try {
            const members = await guild.members.search({ query: username });
            const member = members.first();
            if (member) {
                await member.send(`Time to log your weight!`);
                console.log(`Sent reminder to ${username}`);
            }
        } catch (error) {
            console.error(`Failed to send reminder to ${username}:`, error);
        }
    }
}

// Add this to see when the bot starts up
client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag}`);
    console.log(`Bot ID: ${client.user?.id}`);
});

client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    const content = message.content;
    const username = message.author.username;

    // Debug logging
    console.log('Message received:', {
        content: content,
        author: username
    });

    // Handle @Weight Bot commands (case insensitive)
    if (content.startsWith('@weight bot') || content.startsWith('@Weight Bot')) {
        console.log('Bot was mentioned via @Weight Bot');
        const cleanContent = content
            .replace(/@weight bot/i, '') // Remove mention case-insensitively
            .trim();
        console.log('Clean content:', cleanContent);

        // Process the cleaned content in lowercase for command matching
        const lowerCleanContent = cleanContent.toLowerCase();

        // Handle weight logging via mention
        if (/^\d+\.?\d*\s*(kg|lbs)?$/i.test(cleanContent)) {
            console.log('Processing as weight input');
            await handleWeightLogging(message, cleanContent);
            return;
        }

        // Handle adduser via mention
        if (lowerCleanContent.startsWith('adduser')) {
            await handleAddUser(message, cleanContent);
            return;
        }

        // Handle reminders
        if (cleanContent.includes('remind')) {
            // Set reminder: @Weight Bot remind me at 09:00 on Monday,Wednesday,Friday
            const match = cleanContent.match(/remind me at (\d{1,2}:\d{2}) on ([a-zA-Z,]+)/i);
            
            if (match) {
                const [_, time, daysString] = match;
                const days = daysString.split(',').map(day => day.trim());
                
                if (!userData.users[username]) {
                    await message.reply('Please set your timezone first: @Weight Bot set timezone <timezone>');
                    return;
                }

                const reminder: Reminder = {
                    id: Date.now().toString(),
                    time,
                    days
                };

                userData.users[username].reminders.push(reminder);
                saveUserData();
                
                await message.reply(`Reminder set for ${time} on ${days.join(', ')}`);

                // After saving user data, reschedule reminders
                scheduleNextReminders();
                return;
            }
        }

        // Handle timezone
        if (cleanContent.includes('set timezone')) {
            const timezonePart = cleanContent.split('set timezone')[1].trim();
            if (!timezonePart) {
                await message.reply('Please specify a timezone: @Weight Bot set timezone America/New_York');
                return;
            }
            
            try {
                // Validate timezone
                DateTime.now().setZone(timezonePart);
                
                if (!userData.users[username]) {
                    userData.users[username] = {
                        column: '',  // Initialize with empty string
                        timezone: timezonePart,
                        reminders: []
                    };
                } else {
                    userData.users[username].timezone = timezonePart;
                }
                
                saveUserData();
                await message.reply(`Timezone set to ${timezonePart}`);

                // After saving user data, reschedule reminders
                scheduleNextReminders();
                return;
            } catch (error) {
                await message.reply('Invalid timezone. Please use formats like "America/New_York" or "Europe/London"');
            }
            return;
        }

        // Handle list reminders
        if (cleanContent.includes('list reminders')) {
            const userReminders = userData.users[username]?.reminders || [];
            if (userReminders.length === 0) {
                await message.reply('You have no reminders set.');
                return;
            }

            const reminderList = userReminders
                .map(r => `ID ${r.id}: ${r.time} on ${r.days.join(', ')}`)
                .join('\n');
            
            await message.reply(`Your reminders:\n${reminderList}`);
            return;
        }

        // Handle delete reminder
        if (cleanContent.includes('delete reminder')) {
            const idMatch = cleanContent.match(/delete reminder (\d+)/);
            if (!idMatch) {
                await message.reply('Please specify a reminder ID: @Weight Bot delete reminder <id>');
                return;
            }

            const reminderId = idMatch[1];
            const userReminders = userData.users[username]?.reminders || [];
            const index = userReminders.findIndex(r => r.id === reminderId);
            
            if (index === -1) {
                await message.reply('Reminder not found.');
                return;
            }

            userData.users[username].reminders.splice(index, 1);
            saveUserData();
            await message.reply('Reminder deleted.');

            // After deleting, reschedule reminders
            scheduleNextReminders();
            return;
        }

        // If no command matched, show help
        await message.reply(
            'Available commands:\n' +
            '• !weight <number> [kg|lbs] or @Weight Bot <number> [kg|lbs] - Log your weight\n' +
            '• !adduser <column> <header> <username> or @Weight Bot adduser <column> <header> <username> - Add a new user\n' +
            '• @Weight Bot remind me at HH:MM on day1,day2,... - Set a reminder\n' +
            '• @Weight Bot set timezone <timezone> - Set your timezone\n' +
            '• @Weight Bot list reminders - List your reminders\n' +
            '• @Weight Bot delete reminder <id> - Delete a reminder'
        );
        return;
    }

    // Handle traditional commands (!weight and !adduser)
    if (content.startsWith('!weight')) {
        await handleWeightLogging(message, content.replace('!weight', '').trim());
        return;
    }

    if (content.startsWith('!adduser')) {
        await handleAddUser(message, content.replace('!adduser', '').trim());
        return;
    }

    if (content === 'good bot') {
        await message.reply("Anytime big guy");
        return;
    }

    // Keep the 'bad bot' response
    if (content === 'bad bot') {
        await message.reply("I'm doing my best 😔");
        return;
    }
});

// Update the handleWeightLogging function
async function handleWeightLogging(message: Message, weightContent: string) {
    const username = message.author.username;
    const userColumn = userMappings[username];
    
    console.log('Processing weight for user:', username);
    console.log('User mappings:', userMappings);
    console.log('Found column:', userColumn);

    if (!userColumn) {
        await message.reply('Your username is not mapped to a column.');
        return;
    }

    const weight = parseWeight(weightContent);
    if (weight === null) {  // Explicitly check for null
        await message.reply('Invalid weight format. Please use: <number> [kg|lbs]');
        return;
    }

    if (!isWeightReasonable(weight)) {
        await message.reply(`Weight must be between ${MIN_WEIGHT_LBS} and ${MAX_WEIGHT_LBS} lbs.`);
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

async function handleAddUser(message: Message, addUserContent: string) {
    const parts = addUserContent.split(' ').filter(part => part.trim());
    if (parts.length !== 3) { // column header username
        await message.reply('Usage: !adduser <column> <header> <username> or @Weight Bot adduser <column> <header> <username>');
        return;
    }

    const [column, header, username] = parts;
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

// Replace the old setInterval with this optimized version
setInterval(() => {
    const now = new Date();
    let needsReschedule = false;
    
    // Process due reminders
    while (scheduledReminders.length > 0 && 
           scheduledReminders[0].nextTrigger <= now) {
        const { username, reminder } = scheduledReminders.shift()!;
        sendReminder(username, reminder);
        needsReschedule = true;
    }

    // Reschedule next occurrences if needed
    if (needsReschedule) {
        scheduleNextReminders();
    }
}, 60000); // Still check every minute, but do much less work

// Initial scheduling when bot starts
scheduleNextReminders();
