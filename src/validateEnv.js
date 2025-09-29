const requiredEnvVars = [
    'SERVICE_NAME',
    'ENVIRONMENT'
];

const optionalVars = [
    'COSMOS_ENDPOINT',
    'COSMOS_KEY',
    'COSMOS_DATABASE',
    'COSMOS_CONTRACT_CONTAINER',
    'DYNATRACE_URL',
    'DYNATRACE_API_TOKEN'
];

requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
});

console.log('✅ Required environment variables are set.');
optionalVars.forEach((v) => {
    if (!process.env[v]) console.warn(`ℹ️ Optional var not set: ${v}`);
});
