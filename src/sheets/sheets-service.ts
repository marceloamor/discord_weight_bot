import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import * as dotenv from 'dotenv';

dotenv.config();

interface WeightEntry {
    weight: number;
    username: string;
}

export class SheetsService {
    private readonly sheets;
    private readonly spreadsheetId: string;

    constructor() {
        const auth = new GoogleAuth({
            keyFile: 'credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.sheets = google.sheets({ version: 'v4', auth });
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '';
        console.log('Environment GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID);
        console.log('Using spreadsheet ID:', this.spreadsheetId);
    }

    async recordWeight(entry: WeightEntry, userColumns: { [key: string]: string }) {
        try {
            // Get the user's column from the dynamic mapping
            const userColumn = userColumns[entry.username];
            if (!userColumn) {
                throw new Error(`No column mapping found for user: ${entry.username}`);
            }

            // Get today's date in dd/mm/yyyy format with leading zeros
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            const todayFormatted = `${day}/${month}/${year}`;

            // Log the formatted date
            console.log('Formatted date for today:', todayFormatted);

            // Retrieve all dates from Column A
            const range = 'Discord Data!A:A';
            console.log('Requesting range:', range);

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });

            const values = response.data.values || [];
            console.log('Retrieved dates:', values.map(row => row[0]));

            const todayRow = values.findIndex(row => row[0] === todayFormatted);

            if (todayRow === -1) {
                throw new Error('Could not find today\'s date in the spreadsheet');
            }

            // Update the weight in the correct cell
            const updateRange = `Discord Data!${userColumn}${todayRow + 1}`; // +1 because sheets are 1-indexed
            console.log('Updating range:', updateRange);

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[entry.weight.toString()]]
                }
            });

            return true;
        } catch (error) {
            console.error('Error recording weight:', error);
            throw error;
        }
    }
}
