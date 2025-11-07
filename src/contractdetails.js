// src/contractdetails.js
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

import { DateTime } from "luxon";
import readline from 'readline';
import { getCosmos } from "./connections/cosmos.js";

// Validate environment variables
function validateEnvironment() {
    // Set defaults for required variables if not present
    if (!process.env.SERVICE_NAME) {
        process.env.SERVICE_NAME = 'dashboard';
    }
    if (!process.env.ENVIRONMENT) {
        process.env.ENVIRONMENT = 'SIT';
    }
    
    console.log("✅ Environment variables set (using defaults if needed).");
    
    const optional = ['COSMOS_ENDPOINT', 'COSMOS_KEY', 'COSMOS_DATABASE', 'CONTRACT_CONTAINER', 'CONTRACT_ENTITIES_CONTAINER'];
    const notSet = optional.filter(key => !process.env[key]);
    if (notSet.length > 0) {
        console.log(`ℹ️ Optional environment variables (will use Key Vault): ${notSet.join(', ')}`);
    }
}

async function main() {
    console.log(`${'='.repeat(80)}`);
    console.log(`�� INTERACTIVE CONTRACT DETAILS QUERY RUNNER`);
    console.log(`${'='.repeat(80)}`);
    console.log(`🏷️ Environment: ${process.env.ENVIRONMENT || 'UNKNOWN'}`);
    console.log(`🔧 Service: contract-details`);
    console.log(`🕐 Current Melbourne Time: ${DateTime.now().setZone('Australia/Melbourne').toFormat('yyyy-MM-dd HH:mm:ss')} Australia/Melbourne`);
    console.log(`🕐 Current UTC Time: ${DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')} UTC`);
    console.log(`${'='.repeat(80)}`);

    validateEnvironment();

    // Get Cosmos DB connection using Key Vault
    console.log("🔗 [COSMOS] Initializing Cosmos DB connection...");
    const { containers } = await getCosmos();
    console.log(`✅ [COSMOS] Successfully connected to Cosmos DB`);

    const args = process.argv.slice(2);
    const containersFixed = {
        entitiesContainer: containers.contractEntities,
        statusContainer: containers.contract
    };

    if (args.length > 0) {
        // Non-interactive mode
        const command = args[0];
        const searchTerm = args[1];
        const searchType = args[2] || 'contractId';

        if (!command || !searchTerm) {
            console.log("❌ Usage: npm run debug:sit <command> <searchTerm> [searchType]");
            console.log("   Commands: info, search");
            console.log("   Search types: contractId, batchId, status");
            console.log("   Example: npm run debug:sit info 105049");
            console.log("   Example: npm run debug:sit search 105049 contractId");
            process.exit(1);
        }
        await runCommand(command, searchTerm, searchType, containersFixed);
    } else {
        // Interactive mode
        await runInteractiveMode(containersFixed);
    }
    console.log(`${'='.repeat(80)}`);
    console.log(`🎉 CONTRACT DETAILS QUERY COMPLETED`);
    console.log(`${'='.repeat(80)}`);
}

async function runCommand(command, searchTerm, searchType, containersFixed) {
    console.log(`\n🔍 Running query...`);
    console.log(`${'-'.repeat(40)}`);
    try {
        if (command === 'info') {
            console.log(`🔍 Loading contract info query...`);
            const contractInfoModule = await import("./queries/debug/contractinfo.js");
            await contractInfoModule.run(containersFixed, {
                contractId: searchTerm.includes('CMP-Contract') ? null : searchTerm,
                batchId: searchTerm.includes('CMP-Contract') ? searchTerm : null
            });
        } else if (command === 'search') {
            console.log(`🔍 Loading contract search query...`);
            const contractSearchModule = await import("./queries/debug/contractsearch.js");
            await contractSearchModule.run(containersFixed, {
                searchTerm,
                searchType
            });
        } else {
            console.log(`❌ Unknown command: ${command}`);
            console.log(`Available commands: info, search`);
            process.exit(1);
        }
    } catch (error) {
        console.error(`❌ Error running contract details query:`, error.message);
        console.error(`📋 Stack trace:`, error.stack);
        process.exit(1);
    }
}

async function runInteractiveMode(containersFixed) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
        console.log(`\n📋 INTERACTIVE MODE`);
        console.log(`${'-'.repeat(40)}`);
        console.log(`You can investigate any contract by entering its ID.`);

        let runAgain = true;
        while (runAgain) {
            const contractId = await question(`\n🔍 Enter Contract ID to investigate: `);
            if (!contractId) {
                console.log("❌ No Contract ID provided. Exiting interactive mode.");
                break;
            }

            console.log(`\n🔍 Investigating Contract ID: ${contractId}`);
            console.log(`${'-'.repeat(40)}`);

            await runCommand('info', contractId, 'contractId', containersFixed);

            const anotherQuery = await question(`\n🔄 Would you like to investigate another contract? (y/n): `);
            runAgain = anotherQuery.toLowerCase() === 'y';
        }
    } finally {
        rl.close();
    }
}

main().catch(console.error);
