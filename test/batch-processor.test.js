// test/batch-processor.test.js
/**
 * Basic tests for batch processing utilities
 * Run with: node test/batch-processor.test.js
 */

import {
    cleanContractRows,
    countUniqueContracts,
    extractUniqueBatchIds,
    groupEntitiesByField,
    normalizeBatchId
} from '../src/services/batch-processor.js';

// Simple test framework
let tests = 0;
let passed = 0;

function test(name, fn) {
  tests++;
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
  }
}

function assertEquals(actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(`${message} Expected: ${expected}, Actual: ${actual}`);
  }
}

function assertArrayEquals(actual, expected, message = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
  }
}

// Tests
console.log("🧪 Running batch-processor tests...\n");

test("normalizeBatchId removes CMP-Contract- prefix", () => {
  assertEquals(normalizeBatchId("CMP-Contract-ABC123"), "ABC123");
  assertEquals(normalizeBatchId("XYZ789"), "XYZ789");
  assertEquals(normalizeBatchId(""), "");
});

test("normalizeBatchId handles non-string input", () => {
  assertEquals(normalizeBatchId(null), "");
  assertEquals(normalizeBatchId(undefined), "");
  assertEquals(normalizeBatchId(123), "");
});

test("cleanContractRows filters invalid batchIds", () => {
  const input = [
    { batchId: "ABC123", status: "Success" },
    { batchId: null, status: "Failed" },
    { batchId: "XYZ789", status: "Pending" },
    { status: "NoId" }
  ];
  
  const result = cleanContractRows(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].batchId, "ABC123");
  assertEquals(result[1].batchId, "XYZ789");
});

test("extractUniqueBatchIds removes duplicates and normalizes", () => {
  const input = [
    { batchId: "CMP-Contract-ABC123" },
    { batchId: "ABC123" },
    { batchId: "CMP-Contract-XYZ789" },
    { batchId: "XYZ789" }
  ];
  
  const result = extractUniqueBatchIds(input);
  assertArrayEquals(result.sort(), ["ABC123", "XYZ789"]);
});

test("countUniqueContracts counts unique contract IDs", () => {
  const entityData = new Map([
    ["batch1", { contractId: "CONTRACT_1" }],
    ["batch2", { contractId: "CONTRACT_1" }], // duplicate
    ["batch3", { contractId: "CONTRACT_2" }],
    ["batch4", null] // no entity
  ]);
  
  const result = countUniqueContracts(entityData);
  assertEquals(result, 2);
});

test("groupEntitiesByField groups by specified field", () => {
  const entityData = new Map([
    ["batch1", { countryCode: "AU", status: "Active" }],
    ["batch2", { countryCode: "US", status: "Active" }],
    ["batch3", { countryCode: "AU", status: "Inactive" }]
  ]);
  
  const result = groupEntitiesByField(entityData, "countryCode");
  assertEquals(result.size, 2);
  assertEquals(result.get("AU").length, 2);
  assertEquals(result.get("US").length, 1);
});

console.log(`\n📊 Test Results: ${passed}/${tests} passed`);

if (passed === tests) {
  console.log("🎉 All tests passed!");
  process.exit(0);
} else {
  console.log("💥 Some tests failed!");
  process.exit(1);
}
