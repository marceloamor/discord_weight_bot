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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SheetsService = void 0;
const googleapis_1 = require("googleapis");
const google_auth_library_1 = require("google-auth-library");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
class SheetsService {
    constructor() {
        const auth = new google_auth_library_1.GoogleAuth({
            keyFile: 'credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        this.sheets = googleapis_1.google.sheets({ version: 'v4', auth });
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '';
        console.log('Google Sheets service initialized.');
    }
    recordWeight(entry, userColumns) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const response = yield this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range
                });
                const values = response.data.values || [];
                const todayRow = values.findIndex(row => row[0] === todayFormatted);
                if (todayRow === -1) {
                    throw new Error('Could not find today\'s date in the spreadsheet');
                }
                const updateRange = `Discord Data!${userColumn}${todayRow + 1}`;
                yield this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: updateRange,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[entry.weight.toString()]]
                    }
                });
                console.log(`Weight recorded for ${entry.username} on ${todayFormatted}.`);
                return true;
            }
            catch (error) {
                if (error instanceof Error) {
                    console.error('Error recording weight:', error.message);
                }
                else {
                    console.error('Unknown error recording weight:', error);
                }
                throw error;
            }
        });
    }
}
exports.SheetsService = SheetsService;
