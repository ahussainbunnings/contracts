# Contract Details Query System

This folder contains on-demand queries for getting detailed information about specific contracts.

## 📁 Folder Structure

```
src/queries/contractdetails/
├── contractinfo.js      # Get detailed info for a specific contract
└── contractsearch.js    # Search contracts by various criteria
```

## 🚀 Usage

### 1. Get Contract Details by Contract ID
```bash
npm run contract:sit info 105049
```

### 2. Get Contract Details by Batch ID
```bash
npm run contract:sit info CMP-Contract-96e2fe17-ad36-4c2f-970f-d84edbcb616a
```

### 3. Search Contracts by Contract ID
```bash
npm run contract:sit search 105049 contractId
```

### 4. Search Contracts by Status
```bash
npm run contract:sit search pending status
```

### 5. Search Contracts by Batch ID
```bash
npm run contract:sit search CMP-Contract-96e2fe17-ad36-4c2f-970f-d84edbcb616a batchId
```

## 📊 What Information is Displayed

### Contract Entities Information:
- Contract ID
- Batch ID
- Partition Key
- Contract Status
- Country Code
- Sub Domain
- Timestamp

### Contract Processing Information:
- Processing Status
- Attempts Count
- Employee Retry Count
- Salesforce Response
- Errors (if any)
- Timestamp

## 🔧 Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `info <contractId>` | Get detailed info for contract ID | `npm run contract:sit info 105049` |
| `info <batchId>` | Get detailed info for batch ID | `npm run contract:sit info CMP-Contract-...` |
| `search <term> <type>` | Search contracts by type | `npm run contract:sit search pending status` |

## 🔍 Search Types

| Type | Description | Example |
|------|-------------|---------|
| `contractId` | Search by contract ID | `search 105049 contractId` |
| `batchId` | Search by batch ID | `search CMP-Contract-... batchId` |
| `status` | Search by contract status | `search pending status` |

## 🌍 Environment Support

- **SIT**: `npm run contract:sit`
- **UAT**: `npm run contract:uat`
- **PROD**: `npm run contract:prod`

## 💡 Key Features

- ✅ **On-demand execution** - Run only when you need contract details
- ✅ **Multiple search criteria** - Search by contract ID, batch ID, or status
- ✅ **Detailed information** - Shows both entity and processing details
- ✅ **Error handling** - Graceful error handling and reporting
- ✅ **Environment support** - Works with SIT, UAT, and PROD environments
- ✅ **No metrics sent** - Pure information display, no Dynatrace metrics
