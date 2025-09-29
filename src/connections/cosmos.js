// src/connections/cosmos.js
import { CosmosClient } from "@azure/cosmos";
import { getSecret } from "./keyvault.js";

let cosmosClient = null;
let containers = null;

/**
 * Get Cosmos DB client and containers using Key Vault for connection string
 */
export async function getCosmos() {
    if (cosmosClient && containers) {
        return { cosmosClient, containers };
    }

    try {
        console.log("🔗 [COSMOS] Initializing Cosmos DB connection...");
        
        // Get full connection string from Key Vault
        const connectionString = await getSecret("contracts-cosmosdb-sit");
        
        if (!connectionString?.trim()) {
            throw new Error("Cosmos DB connection string not found in Key Vault");
        }

        // Parse connection string to extract database and container names
        const databaseName = process.env.COSMOS_DATABASE?.trim() || "contractinsvc-qa-db";
        const contractContainerName = process.env.CONTRACT_CONTAINER?.trim() || "contract";
        const entitiesContainerName = process.env.CONTRACT_ENTITIES_CONTAINER?.trim() || "contract-entities";

        console.log(`🔗 [COSMOS] Connecting to database: ${databaseName}`);
        console.log(`🔗 [COSMOS] Contract container: ${contractContainerName}`);
        console.log(`🔗 [COSMOS] Entities container: ${entitiesContainerName}`);

        // Initialize Cosmos client
        cosmosClient = new CosmosClient(connectionString.trim());
        
        // Get database and containers
        const database = cosmosClient.database(databaseName);
        const contractContainer = database.container(contractContainerName);
        const entitiesContainer = database.container(entitiesContainerName);

        containers = {
            contract: contractContainer,
            contractEntities: entitiesContainer
        };

        console.log("✅ [COSMOS] Successfully connected to Cosmos DB");
        return { cosmosClient, containers };

    } catch (error) {
        console.error("❌ [COSMOS] Error connecting to Cosmos DB:", error.message);
        throw error;
    }
}
