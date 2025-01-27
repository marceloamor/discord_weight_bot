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
        console.log('Google Sheets service initialized.');
    }

    async recordWeight(entry: WeightEntry, userColumns: { [key: string]: string }) {
        try {
            const userColumn = userColumns[entry.username];
            if (!userColumn) {
                throw new Error(`No column mapping found for user: ${entry.username}`);
            }

            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const todayFormatted = `${year}-${month}-${day}`;

            const range = 'Discord Data!A:A';

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });

            const values = response.data.values || [];
            const todayRow = values.findIndex(row => row[0] === todayFormatted);

            if (todayRow === -1) {
                throw new Error('Could not find today\'s date in the spreadsheet');
            }

            const updateRange = `Discord Data!${userColumn}${todayRow + 1}`;

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[entry.weight.toString()]]
                }
            });

            console.log(`Weight recorded for ${entry.username} on ${todayFormatted}.`);
            return true;
        } catch (error) {
            if (error instanceof Error) {
                console.error('Error recording weight:', error.message);
            } else {
                console.error('Unknown error recording weight:', error);
            }
            throw error;
        }
    }
}
