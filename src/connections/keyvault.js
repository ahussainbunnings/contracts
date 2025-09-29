// src/connections/keyvault.js
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

let keyVaultClient = null;
let secretsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize Key Vault client
 */
function getKeyVaultClient() {
    if (!keyVaultClient) {
        const keyVaultUrl = process.env.KEY_VAULT_URL?.trim();
        if (!keyVaultUrl) {
            throw new Error("KEY_VAULT_URL environment variable is required");
        }
        
        const credential = new DefaultAzureCredential();
        keyVaultClient = new SecretClient(keyVaultUrl, credential);
    }
    return keyVaultClient;
}

/**
 * Get secret from Key Vault with caching
 */
export async function getSecret(secretName, useCache = true) {
    try {
        // Check cache first
        if (useCache && secretsCache.has(secretName)) {
            const cached = secretsCache.get(secretName);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                console.log(`🔑 [KEYVAULT] Using cached secret: ${secretName}`);
                return cached.value;
            }
        }

        console.log(`🔑 [KEYVAULT] Retrieving secret: ${secretName}`);
        const client = getKeyVaultClient();
        const secret = await client.getSecret(secretName);
        
        // Cache the secret
        secretsCache.set(secretName, {
            value: secret.value,
            timestamp: Date.now()
        });
        
        console.log(`✅ [KEYVAULT] Successfully retrieved secret: ${secretName}`);
        return secret.value;
    } catch (error) {
        console.error(`❌ [KEYVAULT] Error retrieving secret ${secretName}:`, error.message);
        throw error;
    }
}

/**
 * Get multiple secrets from Key Vault
 */
export async function getSecrets(secretNames) {
    const results = {};
    const promises = secretNames.map(async (secretName) => {
        try {
            const value = await getSecret(secretName);
            results[secretName] = value;
        } catch (error) {
            console.error(`❌ [KEYVAULT] Failed to retrieve ${secretName}:`, error.message);
            results[secretName] = null;
        }
    });
    
    await Promise.all(promises);
    return results;
}

/**
 * Clear secrets cache
 */
export function clearSecretsCache() {
    secretsCache.clear();
    console.log("🧹 [KEYVAULT] Secrets cache cleared");
}
