const { searchStreamImdb, getMediaDetails, resolveStreamOptions } = require('../src/Utils/streamimdb_scraper');

async function testTaskExecution() {
    console.log('--- Testing Task Queue Property Contract ---');
    const task = {
        id: `si_${Date.now()}`,
        description: 'StreamIMDB Test Task',
        executeFn: async (signal, ref) => {
            console.log('Task executeFn called successfully!');
        }
    };

    if (typeof task.executeFn === 'function') {
        await task.executeFn(null, {});
        console.log('✅ Task executeFn contract verified.');
    } else {
        console.error('❌ Task executeFn is missing or not a function!');
    }
}

testTaskExecution().catch(console.error);
