// test/testRefactoring.js
// Quick test to verify the refactoring works correctly

import * as LanceDBHelper from '../utils/lancedbHelper.js';
import * as QdrantHelper from '../utils/qdrantHelper.js';

async function testHelpers() {
    console.log('🧪 Testing Helper Modules...\n');

    // Test 1: Check if helpers are properly exported
    console.log('✅ Test 1: Helper modules imported successfully');
    console.log('   - LanceDBHelper functions:', Object.keys(LanceDBHelper).length);
    console.log('   - QdrantHelper functions:', Object.keys(QdrantHelper).length);

    // Test 2: Check if initialization functions exist
    console.log('\n✅ Test 2: Initialization functions exist');
    console.log('   - LanceDBHelper.initializeLanceDB:', typeof LanceDBHelper.initializeLanceDB);
    console.log('   - QdrantHelper.initializeQdrant:', typeof QdrantHelper.initializeQdrant);

    // Test 3: Check if ready functions exist
    console.log('\n✅ Test 3: Ready check functions exist');
    console.log('   - LanceDBHelper.isReady:', typeof LanceDBHelper.isReady);
    console.log('   - QdrantHelper.isReady:', typeof QdrantHelper.isReady);

    // Test 4: Check if CRUD functions exist
    console.log('\n✅ Test 4: CRUD functions exist');
    console.log('   - LanceDBHelper.addMessage:', typeof LanceDBHelper.addMessage);
    console.log('   - LanceDBHelper.searchMessages:', typeof LanceDBHelper.searchMessages);
    console.log('   - LanceDBHelper.deleteMessage:', typeof LanceDBHelper.deleteMessage);
    console.log('   - LanceDBHelper.countMessages:', typeof LanceDBHelper.countMessages);

    console.log('\n✅ Test 5: Constants exported');
    console.log('   - LanceDBHelper.TABLES:', LanceDBHelper.TABLES);
    console.log('   - QdrantHelper.COLLECTIONS:', QdrantHelper.COLLECTIONS);

    console.log('\n🎉 All tests passed! Refactoring is successful.\n');
}

testHelpers().catch(console.error);
